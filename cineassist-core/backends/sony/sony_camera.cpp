#include "sony_camera.h"

#include "cineassist/camera_math.h"
#include "cineassist/image_decode.h"

#include "CameraRemote_SDK.h"
#include "CrDeviceProperty.h"
#include "IDeviceCallback.h"

#include <cctype>
#include <cerrno>
#if !defined(_WIN32)
#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>
#endif
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <future>
#include <limits>
#include <thread>

namespace SDK = SCRSDK;

namespace cineassist {

namespace {

// SDK init/release is process-global; reference-count it across camera objects.
std::mutex gInitMutex;
int gInitCount = 0;

// Set if Init() never returned. The SDK is then unusable for this process.
std::atomic<bool> gSdkWedged{false};

constexpr const char* kQuarantineHint =
    "CrSDK Init() did not return within 15 s. On macOS this is almost always Gatekeeper "
    "quarantine on the SDK's CrAdapter plugins blocking dlopen(). Fix once with:\n"
    "  xattr -dr com.apple.quarantine <path-to>/CrSDK_v2.02.00_*_Mac\n"
    "then rebuild so the cleaned libraries are copied next to the executable.";

bool sdkAcquire() {
    std::lock_guard<std::mutex> lock(gInitMutex);
    if (gSdkWedged) return false;
    if (gInitCount == 0) {
        // Init() loads the transport plugins and can block indefinitely (see hint);
        // run it on a watchdog so the on-set app never freezes.
        auto done = std::make_shared<std::promise<bool>>();
        std::future<bool> result = done->get_future();
        std::thread([done] { done->set_value(SDK::Init()); }).detach();
        if (result.wait_for(std::chrono::seconds(15)) != std::future_status::ready) {
            gSdkWedged = true;
            std::fprintf(stderr, "%s\n", kQuarantineHint);
            return false;
        }
        if (!result.get()) return false;
    }
    ++gInitCount;
    return true;
}

void sdkRelease() {
    std::lock_guard<std::mutex> lock(gInitMutex);
    if (gSdkWedged) return;
    if (gInitCount > 0 && --gInitCount == 0) SDK::Release();
}

std::string toUtf8(const CrChar* s) {
    if (!s) return {};
#if defined(_WIN32)
    std::string out;
    for (; *s; ++s) out.push_back(*s < 0x80 ? static_cast<char>(*s) : '?');
    return out;
#else
    return std::string(s);
#endif
}

// CrSDK strings are length-prefixed UTF-16: [len][chars...] (len includes the NUL).
std::string utf16PrefixedToUtf8(const CrInt16u* p) {
    if (!p || p[0] == 0) return {};
    std::string out;
    for (CrInt16u i = 0; i < p[0]; ++i) {
        const CrInt16u c = p[1 + i];
        if (c == 0) break;
        if (c < 0x80) out.push_back(static_cast<char>(c));
        else if (c < 0x800) { out.push_back(static_cast<char>(0xC0 | (c >> 6))); out.push_back(static_cast<char>(0x80 | (c & 0x3F))); }
        else { out.push_back(static_cast<char>(0xE0 | (c >> 12))); out.push_back(static_cast<char>(0x80 | ((c >> 6) & 0x3F))); out.push_back(static_cast<char>(0x80 | (c & 0x3F))); }
    }
    return out;
}

std::string modelId(const SDK::ICrCameraObjectInfo* info) {
    std::string id;
    if (toUtf8(info->GetConnectionTypeName()) == "IP") id = toUtf8(info->GetMACAddressChar());
    else id = std::string(reinterpret_cast<const char*>(info->GetId()), info->GetIdSize());
    // USB ids can contain NULs; keep printable characters only.
    std::string clean;
    for (char ch : id) if (ch >= 0x20 && ch < 0x7f) clean.push_back(ch);
    return clean;
}

double frameRateFromSetting(uint64_t v) {
    switch (v) {
        case SDK::CrRecordingFrameRateSettingMovie_120p: return 119.88;
        case SDK::CrRecordingFrameRateSettingMovie_100p: return 100;
        case SDK::CrRecordingFrameRateSettingMovie_60p: return 59.94;
        case SDK::CrRecordingFrameRateSettingMovie_50p: return 50;
        case SDK::CrRecordingFrameRateSettingMovie_30p: return 29.97;
        case SDK::CrRecordingFrameRateSettingMovie_25p: return 25;
        case SDK::CrRecordingFrameRateSettingMovie_24p: return 23.976;
        case SDK::CrRecordingFrameRateSettingMovie_23_98p: return 23.976;
        case SDK::CrRecordingFrameRateSettingMovie_29_97p: return 29.97;
        case SDK::CrRecordingFrameRateSettingMovie_59_94p: return 59.94;
        case SDK::CrRecordingFrameRateSettingMovie_24_00p: return 24;
        case SDK::CrRecordingFrameRateSettingMovie_119_88p: return 119.88;
        default: return 0;
    }
}

// Decode the element at `index` of a property's possible-values array.
uint64_t arrayValue(const SDK::CrDeviceProperty& p, uint32_t index) {
    const CrInt8u* raw = p.GetSetValues() && p.GetSetValueSize() ? p.GetSetValues() : p.GetValues();
    const uint32_t type = p.GetValueType() & ~static_cast<uint32_t>(SDK::CrDataType_ArrayBit);
    uint64_t v = 0;
    switch (type & 0x0F) {
        case SDK::CrDataType_UInt8: { CrInt8u x; std::memcpy(&x, raw + index * 1, 1); v = x; break; }
        case SDK::CrDataType_UInt16: { CrInt16u x; std::memcpy(&x, raw + index * 2, 2); v = x; break; }
        case SDK::CrDataType_UInt32: { CrInt32u x; std::memcpy(&x, raw + index * 4, 4); v = x; break; }
        case SDK::CrDataType_UInt64: { CrInt64u x; std::memcpy(&x, raw + index * 8, 8); v = x; break; }
        default: break;
    }
    return v;
}

// Per the CrSDK reference, these bodies start AND stop on "Down" and need an
// immediate "Up" after each press.
bool toggleRecordModel(const std::string& model) {
    static const char* kModels[] = {"ILCE-1", "ILCE-9M2", "ILCE-7RM4A", "ILCE-7RM4", "ILCE-7SM3", "ILCE-7C", "DSC-RX0M2"};
    for (const char* m : kModels) if (model == m) return true;
    return false;
}

// "ILCE-7M4" -> CrCameraDeviceModel_ILCE_7M4, for connect-by-IP without discovery.
bool modelFromName(std::string name, SDK::CrCameraDeviceModelList& out) {
    for (auto& c : name) c = c == '_' ? '-' : static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
#define CA_MODEL(sym, str) if (name == str) { out = SDK::CrCameraDeviceModel_##sym; return true; }
    CA_MODEL(ILCE_7RM4, "ILCE-7RM4") CA_MODEL(ILCE_9M2, "ILCE-9M2") CA_MODEL(ILCE_7C, "ILCE-7C")
    CA_MODEL(ILCE_7SM3, "ILCE-7SM3") CA_MODEL(ILCE_1, "ILCE-1") CA_MODEL(ILCE_7RM4A, "ILCE-7RM4A")
    CA_MODEL(DSC_RX0M2, "DSC-RX0M2") CA_MODEL(ILCE_7M4, "ILCE-7M4") CA_MODEL(ILME_FX3, "ILME-FX3")
    CA_MODEL(ILME_FX30, "ILME-FX30") CA_MODEL(ILME_FX6, "ILME-FX6") CA_MODEL(ILCE_7RM5, "ILCE-7RM5")
    CA_MODEL(ZV_E1, "ZV-E1") CA_MODEL(ILCE_6700, "ILCE-6700") CA_MODEL(ILCE_7CM2, "ILCE-7CM2")
    CA_MODEL(ILCE_7CR, "ILCE-7CR") CA_MODEL(ILX_LR1, "ILX-LR1") CA_MODEL(MPC_2610, "MPC-2610")
    CA_MODEL(ILCE_9M3, "ILCE-9M3") CA_MODEL(ZV_E10M2, "ZV-E10M2") CA_MODEL(PXW_Z200, "PXW-Z200")
    CA_MODEL(HXR_NX800, "HXR-NX800") CA_MODEL(ILCE_1M2, "ILCE-1M2") CA_MODEL(ILME_FX3A, "ILME-FX3A")
    CA_MODEL(BRC_AM7, "BRC-AM7") CA_MODEL(ILME_FR7, "ILME-FR7") CA_MODEL(ILME_FX2, "ILME-FX2")
    CA_MODEL(DSC_RX1RM3, "DSC-RX1RM3") CA_MODEL(ILCE_7M5, "ILCE-7M5") CA_MODEL(PXW_Z300, "PXW-Z300")
    CA_MODEL(PXW_Z380, "PXW-Z380") CA_MODEL(ILCE_7RM6, "ILCE-7RM6")
#undef CA_MODEL
    return false;
}

// Dotted IPv4 -> the SDK's packed form (first octet in the low byte, as in Sony's sample).
bool parseIpv4(const std::string& s, CrInt32u& out) {
    unsigned a, b, c, d;
    char tail;
    if (std::sscanf(s.c_str(), "%u.%u.%u.%u%c", &a, &b, &c, &d, &tail) != 4 || a > 255 || b > 255 || c > 255 || d > 255)
        return false;
    out = a | (b << 8) | (c << 16) | (d << 24);
    return true;
}

// True if `ip` accepts a TCP connection on `port` within `timeoutMs`. Used before
// handing an address to the SDK, whose SSH/PTP-IP connect can block for minutes on
// an unreachable host.
bool tcpReachable(const std::string& ip, int port, int timeoutMs) {
#if defined(_WIN32)
    return true;  // pre-check not implemented on Windows; the SDK's own timeout applies
#else
    const int fd = ::socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return true;
    ::fcntl(fd, F_SETFL, ::fcntl(fd, F_GETFL, 0) | O_NONBLOCK);
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(static_cast<uint16_t>(port));
    if (::inet_pton(AF_INET, ip.c_str(), &addr.sin_addr) != 1) { ::close(fd); return false; }
    bool ok = ::connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof addr) == 0;
    if (!ok && errno == EINPROGRESS) {
        pollfd pfd{fd, POLLOUT, 0};
        if (::poll(&pfd, 1, timeoutMs) == 1) {
            int soErr = 0;
            socklen_t len = sizeof soErr;
            ok = ::getsockopt(fd, SOL_SOCKET, SO_ERROR, &soErr, &len) == 0 && soErr == 0;
        }
    }
    ::close(fd);
    return ok;
#endif
}

std::string ipToString(CrInt32u ip) {
    char buf[20];
    std::snprintf(buf, sizeof buf, "%u.%u.%u.%u", ip & 0xFF, (ip >> 8) & 0xFF, (ip >> 16) & 0xFF, (ip >> 24) & 0xFF);
    return buf;
}

// On macOS, apps that watch for cameras (Lightroom's import dialog, Photos, Image
// Capture...) make the system's ptpcamerad take exclusive hold of a USB camera, so
// the SDK can't open its session (it fails with Connect_TimeOut). Name the culprit.
std::string macCameraBlockers() {
#if defined(__APPLE__)
    // Match app bundles, not system helpers (e.g. ".../Image Capture/Support/icdd" always runs).
    static const std::pair<const char*, const char*> kApps[] = {
        {"Adobe Lightroom Classic.app/", "Adobe Lightroom Classic"}, {"Adobe Lightroom.app/", "Adobe Lightroom"},
        {"/Photos.app/", "Photos"}, {"/Image Capture.app/", "Image Capture"}, {"Capture One", "Capture One"},
        {"Imaging Edge", "Imaging Edge"}, {"Creators' App.app/", "Creators' App"}, {"/Preview.app/", "Preview"},
    };
    std::string running;
    if (FILE* p = popen("/bin/ps -axo comm=", "r")) {
        char line[1024];
        while (fgets(line, sizeof line, p)) running += line;
        pclose(p);
    }
    std::string found;
    for (const auto& app : kApps) {
        if (running.find(app.first) != std::string::npos && found.find(app.second) == std::string::npos)
            found += std::string(found.empty() ? "" : ", ") + app.second;
    }
    if (found.empty() && running.find("ptpcamerad") != std::string::npos) found = "macOS camera service (ptpcamerad)";
    return found;
#else
    return {};
#endif
}

// Plain-English explanation of a CrSDK connection error, with what to try.
std::string describeConnectError(uint32_t code, bool network) {
    switch (code) {
        case SDK::CrError_Connect_TimeOut:
        case SDK::CrError_Reconnect_TimeOut:
            return network
                ? "Camera was found but didn't finish connecting. If the camera shows a connection or pairing prompt, "
                  "accept it. Make sure no other app (Imaging Edge, Creators' App, another computer) is connected to it, "
                  "keep it on the same Wi-Fi as this computer, then try again."
                : [] {
                      const std::string blockers = macCameraBlockers();
                      if (!blockers.empty() && blockers.find("ptpcamerad") == std::string::npos)
                          return "The camera is locked by " + blockers + ": macOS hands a USB camera to apps that watch for "
                                 "cameras, so the remote-control connection can't open. Quit " + blockers +
                                 " (in Lightroom also turn off Preferences → General → \"Show import dialog when a memory card is "
                                 "detected\"), unplug and replug the camera, then press Connect.";
                      return std::string("Camera was found but didn't finish connecting. Unplug and replug the USB cable, check the "
                                         "camera's USB Connection Mode is PC Remote, and quit apps that may grab it (Lightroom, "
                                         "Photos, Image Capture, Imaging Edge).");
                  }();
        case SDK::CrError_Connect_FailRejected:
            return "The camera rejected the connection — on the camera, allow this computer (PC Remote / pairing prompt) and try again.";
        case SDK::CrError_Connect_FailBusy:
        case SDK::CrError_Connect_SessionAlreadyOpened:
            return "The camera is already connected to another app or computer. Disconnect it there first.";
        case SDK::CrError_Connect_SSH_ServerConnectFailed:
            return "Couldn't open the camera's secure connection. Check Network → Network Option → Access Authen. is on, and the IP is right.";
        case SDK::CrError_Connect_SSH_ServerAuthenticationFailed:
            return "The camera's security fingerprint didn't match. Check it against the camera's Access Authen. Info.";
        case SDK::CrError_Connect_SSH_UserAuthenticationFailed:
            return "Wrong Access Authentication user or password — see the camera's Network → Network Option → Access Authen. Info.";
        case SDK::CrError_Connect_SSH_GetFingerprintFailed:
            return "Couldn't read the camera's security fingerprint. Make sure Access Authentication is enabled on the camera.";
        case SDK::CrError_Connect_SSH_NotSupported:
            return "This camera doesn't support authenticated network connections — leave user and password empty.";
        case SDK::CrError_Connect_Disconnected:
            return "The camera dropped the connection while connecting. Check the cable or Wi-Fi signal and try again.";
        default: {
            char buf[96];
            std::snprintf(buf, sizeof buf, "camera did not accept the connection (CrSDK error 0x%x)", code);
            return buf;
        }
    }
}

// The camera name the body shows when asking to approve a network connection.
const CrInt16u kPairingName[] = {'C', 'i', 'n', 'e', 'A', 's', 's', 'i', 's', 't', 0};

// One connection attempt at a time: a camera accepts a single session, and two
// overlapping attempts (auto-discovery + a manual connect) make one of them time out.
std::mutex gConnectMutex;

uint32_t elementSize(uint32_t valueType) {
    switch (valueType & 0x0F) {
        case SDK::CrDataType_UInt8: return 1;
        case SDK::CrDataType_UInt16: return 2;
        case SDK::CrDataType_UInt32: return 4;
        case SDK::CrDataType_UInt64: return 8;
        default: return 0;
    }
}

} // namespace

// ─── Callback + shared state ──────────────────────────────────────────────────

struct SonyCamera::Impl final : public SDK::IDeviceCallback {
    std::mutex mu;
    std::condition_variable cv;
    bool connectDone = false;
    bool connectOk = false;
    uint32_t lastError = 0;
    std::atomic<bool> connected{false};
    std::atomic<bool> propsDirty{true};

    SDK::ICrEnumCameraObjectInfo* enumInfo = nullptr;
    SDK::ICrCameraObjectInfo* createdInfo = nullptr;  // connect-by-IP object we own
    SDK::CrDeviceHandle handle = 0;
    std::string model;
    std::string user, password, expectedFingerprint, fingerprint;
    std::string link;                                 // "USB" / "Wi-Fi/LAN 1.2.3.4"
    std::atomic<bool> reconnecting{false};
    CameraState cached;
    std::chrono::steady_clock::time_point lastRefresh{};
    std::vector<CrInt8u> lvBuffer;

    void OnConnected(SDK::DeviceConnectionVersioin) override {
        std::lock_guard<std::mutex> lock(mu);
        connected = true;
        reconnecting = false;
        connectDone = true;
        connectOk = true;
        cv.notify_all();
    }
    void OnDisconnected(CrInt32u error) override {
        std::lock_guard<std::mutex> lock(mu);
        connected = false;
        reconnecting = false;
        lastError = error;
        connectDone = true;
        cv.notify_all();
    }
    void OnError(CrInt32u error) override {
        std::lock_guard<std::mutex> lock(mu);
        lastError = error;
        connectDone = true;
        connectOk = false;
        cv.notify_all();
    }
    void OnPropertyChanged() override { propsDirty = true; }
    void OnPropertyChangedCodes(CrInt32u, CrInt32u*) override { propsDirty = true; }
    void OnLvPropertyChanged() override {}
    void OnLvPropertyChangedCodes(CrInt32u, CrInt32u*) override {}
    void OnCompleteDownload(CrChar*, CrInt32u) override {}
    void OnNotifyContentsTransfer(CrInt32u, SDK::CrContentHandle, CrChar*) override {}
    // Wi-Fi drops trigger the SDK's auto-reconnect; stay "connected" while it retries.
    void OnWarning(CrInt32u warning) override {
        if (warning == SDK::CrWarning_Connect_Reconnecting) reconnecting = true;
        else if (warning == SDK::CrWarning_Connect_Reconnected) { reconnecting = false; propsDirty = true; }
    }
    void OnWarningExt(CrInt32u, CrInt32, CrInt32, CrInt32) override {}
};

SonyCamera::SonyCamera() : impl_(std::make_unique<Impl>()) {}

SonyCamera::~SonyCamera() {
    disconnect();
}

std::vector<CameraInfo> SonyCamera::enumerate(int timeoutSec) {
    std::vector<CameraInfo> out;
    if (!sdkAcquire()) return out;
    SDK::ICrEnumCameraObjectInfo* list = nullptr;
    const SDK::CrError err = SDK::EnumCameraObjects(&list, static_cast<CrInt8u>(timeoutSec));
    if (!err && list) {
        for (CrInt32u i = 0; i < list->GetCount(); ++i) {
            const auto* info = list->GetCameraObjectInfo(i);
            out.push_back({modelId(info), toUtf8(info->GetModel()), toUtf8(info->GetConnectionTypeName())});
        }
        list->Release();
    }
    sdkRelease();
    return out;
}

bool SonyCamera::connect(const std::string& id, std::string& error) {
    disconnect();
    std::lock_guard<std::mutex> connectLock(gConnectMutex);
    if (!sdkAcquire()) {
        error = gSdkWedged ? "CrSDK Init() hung (see message above)"
                           : "CrSDK Init() failed — check that the CrAdapter libraries sit next to the executable";
        return false;
    }
    Impl& m = *impl_;
    auto fail = [&](const std::string& msg) {
        error = msg;
        if (m.enumInfo) { m.enumInfo->Release(); m.enumInfo = nullptr; }
        if (m.createdInfo) { m.createdInfo->Release(); m.createdInfo = nullptr; }
        sdkRelease();
        return false;
    };

    // "ip:<address>[:<model>]" targets a network camera directly.
    std::string targetIp, targetModel;
    CrInt32u targetIpPacked = 0;
    if (id.rfind("ip:", 0) == 0) {
        const std::string rest = id.substr(3);
        const size_t colon = rest.find(':');
        targetIp = rest.substr(0, colon);
        if (colon != std::string::npos) targetModel = rest.substr(colon + 1);
        if (!parseIpv4(targetIp, targetIpPacked)) return fail("invalid IP address '" + targetIp + "'");
        // Sony bodies listen on 15740 (PTP-IP) and 22 (SSH access authentication).
        if (!tcpReachable(targetIp, 15740, 3000) && !tcpReachable(targetIp, 22, 1500)) {
            return fail("no camera answering at " + targetIp + ". Check the camera and this computer are on the same "
                        "Wi-Fi network, PC Remote is On with connection method Wi-Fi, and the IP matches the camera's "
                        "Network → Wi-Fi Settings → IP address.");
        }
    }

    // Discovery covers USB and Wi-Fi/LAN (SSDP); network cameras need a longer window.
    SDK::EnumCameraObjects(&m.enumInfo, 5);
    const SDK::ICrCameraObjectInfo* chosen = nullptr;
    for (CrInt32u i = 0; m.enumInfo && i < m.enumInfo->GetCount(); ++i) {
        const auto* info = m.enumInfo->GetCameraObjectInfo(i);
        const bool match = !targetIp.empty() ? info->GetIPAddress() == targetIpPacked
                                             : id.empty() || modelId(info) == id || toUtf8(info->GetModel()) == id;
        if (match) { chosen = info; break; }
    }
    if (!chosen && !targetIp.empty()) {
        // Not discoverable (different subnet, multicast blocked): build the object by hand.
        SDK::CrCameraDeviceModelList model = SDK::CrCameraDeviceModel_ILCE_7M4;
        if (!targetModel.empty() && !modelFromName(targetModel, model))
            return fail("unknown camera model '" + targetModel + "' (use e.g. ILCE-7M4, ILME-FX3)");
        CrInt8u mac[6] = {0};
        const bool ssh = !m.user.empty() || std::getenv("CINEASSIST_SONY_USER");
        const SDK::CrError e = SDK::CreateCameraObjectInfoEthernetConnection(&m.createdInfo, model, targetIpPacked, mac, ssh ? 1 : 0);
        if (e || !m.createdInfo) return fail("could not create a network camera object for " + targetIp);
        chosen = m.createdInfo;
    }
    if (!chosen) {
        return fail(id.empty() ? "no Sony camera found. USB: set the camera's USB Connection Mode to 'PC Remote'. "
                                 "Wi-Fi: turn on PC Remote with connection method Wi-Fi and join the same network, "
                                 "or connect by IP (ip:<address>)."
                               : "camera '" + id + "' not found");
    }
    m.model = toUtf8(chosen->GetModel());
    if (m.model.empty()) m.model = targetModel.empty() ? "Sony camera" : targetModel;
    const bool network = toUtf8(chosen->GetConnectionTypeName()) == "IP" || !targetIp.empty();
    m.link = network ? "Wi-Fi/LAN " + (targetIp.empty() ? ipToString(chosen->GetIPAddress()) : targetIp) : "USB";

    std::string user = m.user, password = m.password, fingerprint;
    if (user.empty()) if (const char* u = std::getenv("CINEASSIST_SONY_USER")) user = u;
    if (password.empty()) if (const char* p = std::getenv("CINEASSIST_SONY_PASSWORD")) password = p;
    std::string expected = m.expectedFingerprint;
    if (expected.empty()) if (const char* f = std::getenv("CINEASSIST_SONY_FINGERPRINT")) expected = f;
    m.fingerprint.clear();
    if (chosen->GetSSHsupport() == SDK::CrSSHsupport_ON) {
        char fp[128] = {0};
        CrInt32u fpLen = 0;
        if (SDK::GetFingerprint(const_cast<SDK::ICrCameraObjectInfo*>(chosen), fp, &fpLen) == SDK::CrError_None)
            fingerprint.assign(fp, fpLen);
        m.fingerprint = fingerprint;
        if (user.empty()) {
            return fail(m.model + " over " + m.link + " requires Access Authentication. Enter the camera's "
                        "user and password (camera: Network → Network Option → Access Authen. Info).");
        }
        // Host-key pinning: refuse a camera whose key changed (possible impersonation).
        if (!expected.empty() && expected != fingerprint)
            return fail("camera fingerprint does not match the pinned one — refusing to connect");
    }

    {
        std::lock_guard<std::mutex> lock(m.mu);
        m.connectDone = false;
        m.connectOk = false;
        m.lastError = 0;
    }
    const SDK::CrError err = SDK::Connect(const_cast<SDK::ICrCameraObjectInfo*>(chosen), &m, &m.handle,
                                          SDK::CrSdkControlMode_Remote, SDK::CrReconnecting_ON,
                                          user.c_str(), password.c_str(), fingerprint.c_str(),
                                          static_cast<CrInt32u>(fingerprint.size()), kPairingName);
    if (err) {
        error = describeConnectError(static_cast<uint32_t>(err), network);
        m.enumInfo->Release();
        m.enumInfo = nullptr;
        sdkRelease();
        return false;
    }
    // Network bodies may ask the operator to approve the computer on the camera
    // screen, so give them time; USB answers within a few seconds.
    std::unique_lock<std::mutex> lock(m.mu);
    const auto wait = network ? std::chrono::seconds(60) : std::chrono::seconds(15);
    if (!m.cv.wait_for(lock, wait, [&] { return m.connectDone; }) || !m.connectOk) {
        error = describeConnectError(m.lastError ? m.lastError : static_cast<uint32_t>(SDK::CrError_Connect_TimeOut), network);
        lock.unlock();
        disconnect();
        return false;
    }
    lock.unlock();
    m.propsDirty = true;
    // Live view needs a moment to start after connecting.
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    return true;
}

void SonyCamera::disconnect() {
    Impl& m = *impl_;
    if (m.handle) {
        if (m.connected) {
            std::unique_lock<std::mutex> lock(m.mu);
            m.connectDone = false;
            lock.unlock();
            SDK::Disconnect(m.handle);
            lock.lock();
            m.cv.wait_for(lock, std::chrono::seconds(3), [&] { return m.connectDone; });
        }
        SDK::ReleaseDevice(m.handle);
        m.handle = 0;
        m.connected = false;
        m.reconnecting = false;
        if (m.enumInfo) { m.enumInfo->Release(); m.enumInfo = nullptr; }
        if (m.createdInfo) { m.createdInfo->Release(); m.createdInfo = nullptr; }
        sdkRelease();
    } else if (m.enumInfo || m.createdInfo) {
        if (m.enumInfo) { m.enumInfo->Release(); m.enumInfo = nullptr; }
        if (m.createdInfo) { m.createdInfo->Release(); m.createdInfo = nullptr; }
        sdkRelease();
    }
}

bool SonyCamera::isConnected() const { return impl_->connected || impl_->reconnecting; }

void SonyCamera::setCredentials(const std::string& user, const std::string& password, const std::string& expectedFingerprint) {
    impl_->user = user;
    impl_->password = password;
    impl_->expectedFingerprint = expectedFingerprint;
}

std::string SonyCamera::fingerprint() const { return impl_->fingerprint; }

std::string SonyCamera::connectionLabel() const {
    if (impl_->reconnecting) return impl_->link + " (reconnecting)";
    return impl_->connected ? impl_->link : std::string();
}

void SonyCamera::refreshProperties() {
    Impl& m = *impl_;
    SDK::CrDeviceProperty* list = nullptr;
    CrInt32 n = 0;
    if (SDK::GetDeviceProperties(m.handle, &list, &n) != SDK::CrError_None || !list) return;

    CameraState s;
    s.model = m.model;
    s.connected = m.connected;
    bool zoomInMm = true;
    double ndTransmittanceStops = -1, ndDensityStops = -1;
    for (CrInt32 i = 0; i < n; ++i) {
        const SDK::CrDeviceProperty& p = list[i];
        if (p.GetPropertyEnableFlag() == SDK::CrEnableValue_NotSupported) continue;
        const uint64_t v = p.GetCurrentValue();
        switch (p.GetCode()) {
            case SDK::CrDeviceProperty_FNumber:
                if (v > 0 && v < SDK::CrFnumber_IrisClose) s.fNumber = v / 100.0;
                break;
            case SDK::CrDeviceProperty_TNumber:
                if (v > 0 && v < 0xFFFD) s.tStop = v / 100.0;
                break;
            case SDK::CrDeviceProperty_IsoSensitivity: {
                const uint32_t iso = static_cast<uint32_t>(v) & 0x00FFFFFF;
                if (iso == SDK::CrISO_AUTO) s.isoAuto = true;
                else s.iso = static_cast<int>(iso);
                break;
            }
            case SDK::CrDeviceProperty_ShutterSpeed: {
                const uint32_t sv = static_cast<uint32_t>(v);
                const uint32_t num = sv >> 16, den = sv & 0xFFFF;
                if (sv != SDK::CrShutterSpeed_Bulb && sv != SDK::CrShutterSpeed_Nothing && den) s.shutterSeconds = static_cast<double>(num) / den;
                break;
            }
            case SDK::CrDeviceProperty_ShutterAngle:
                if (v != SDK::CrShutterAngle_Disable && v < 360000 * 2) s.shutterAngle = v / 1000.0;
                break;
            case SDK::CrDeviceProperty_WhiteBalance:
                s.whiteBalanceAuto = (v == SDK::CrWhiteBalance_AWB);
                break;
            case SDK::CrDeviceProperty_Colortemp:
                if (v >= 1500 && v <= 20000) s.whiteBalanceK = static_cast<int>(v);
                break;
            case SDK::CrDeviceProperty_Movie_Recording_FrameRateSetting:
                s.frameRate = frameRateFromSetting(v);
                break;
            case SDK::CrDeviceProperty_NDFilter:
                if (v == SDK::CrNDFilter_OFF) ndTransmittanceStops = ndDensityStops = 0;
                break;
            case SDK::CrDeviceProperty_NDFilterValue: {
                const uint32_t num = static_cast<uint32_t>(v >> 32), den = static_cast<uint32_t>(v);
                if (v != SDK::CrNDFilterValue_Nothing && num && den) ndTransmittanceStops = std::log2(static_cast<double>(den) / num);
                break;
            }
            case SDK::CrDeviceProperty_NDFilterOpticalDensityValue:
                if (v < 0xFFFF) ndDensityStops = math::ndDensityToStops(v / 100.0);
                break;
            case SDK::CrDeviceProperty_ZoomDistanceUnitSetting:
                zoomInMm = (v == SDK::CrZoomDistanceUnitSetting_mm);
                break;
            case SDK::CrDeviceProperty_ZoomDistance:
                if (v > 0 && v < 0xFFFFFFFF) s.focalLengthMm = v / 1000.0;
                break;
            case SDK::CrDeviceProperty_BatteryRemain:
                if (v <= 100) s.batteryPercent = static_cast<int>(v);
                break;
            case SDK::CrDeviceProperty_RecordingState:
                s.recording = (v == SDK::CrMovie_Recording_State_Recording);
                break;
            case SDK::CrDeviceProperty_LensModelName:
                s.lensModel = utf16PrefixedToUtf8(p.GetCurrentStr());
                break;
            default:
                break;
        }
    }
    if (!zoomInMm) s.focalLengthMm = 0;
    if (ndDensityStops >= 0) s.ndStops = ndDensityStops;
    else if (ndTransmittanceStops >= 0) s.ndStops = ndTransmittanceStops;
    // Bodies in shutter-speed mode report no angle; derive it so the engine sees both.
    if (s.shutterAngle <= 0 && s.shutterSeconds > 0 && s.frameRate > 0)
        s.shutterAngle = math::shutterAngleFromSeconds(s.shutterSeconds, s.frameRate);
    if (s.shutterSeconds <= 0 && s.shutterAngle > 0 && s.frameRate > 0)
        s.shutterSeconds = math::shutterSecondsFromAngle(s.shutterAngle, s.frameRate);

    SDK::ReleaseDeviceProperties(m.handle, list);
    std::lock_guard<std::mutex> lock(m.mu);
    m.cached = s;
    m.lastRefresh = std::chrono::steady_clock::now();
}

CameraState SonyCamera::state() {
    Impl& m = *impl_;
    if (!m.connected) {
        CameraState s;
        s.model = m.model;
        return s;
    }
    const auto age = std::chrono::steady_clock::now() - m.lastRefresh;
    if (m.propsDirty.exchange(false) || age > std::chrono::seconds(2)) refreshProperties();
    std::lock_guard<std::mutex> lock(m.mu);
    return m.cached;
}

bool SonyCamera::liveView(Frame& out) {
    Impl& m = *impl_;
    if (!m.connected) return false;
    SDK::CrImageInfo info;
    if (SDK::GetLiveViewImageInfo(m.handle, &info) != SDK::CrError_None) return false;
    const CrInt32u size = info.GetBufferSize();
    if (size == 0) return false;
    if (m.lvBuffer.size() < size) m.lvBuffer.resize(size);

    SDK::CrImageDataBlock block;
    block.SetSize(size);
    block.SetData(m.lvBuffer.data());
    const SDK::CrError err = SDK::GetLiveViewImage(m.handle, &block);
    // Live view isn't ready for a few frames after connect / mode change.
    if (err == SDK::CrWarning_Frame_NotUpdated || err != SDK::CrError_None) return false;
    if (block.GetImageSize() == 0) return false;

    std::string decodeErr;
    if (!decodeImage(block.GetImageData(), block.GetImageSize(), out, decodeErr)) return false;
    out.encoded.assign(block.GetImageData(), block.GetImageData() + block.GetImageSize());
    out.timestampMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                          std::chrono::steady_clock::now().time_since_epoch()).count();
    // Sony live view is display-referred even when recording S-Log3 unless the
    // monitor LUT is off; the caller can override logEncoded from config.
    out.logEncoded = false;
    return true;
}

// Live view straight from the camera as JPEG — no decode — for smooth streaming.
bool SonyCamera::liveViewJpeg(std::vector<uint8_t>& out) {
    Impl& m = *impl_;
    if (!m.connected) return false;
    SDK::CrImageInfo info;
    if (SDK::GetLiveViewImageInfo(m.handle, &info) != SDK::CrError_None) return false;
    const CrInt32u size = info.GetBufferSize();
    if (size == 0) return false;
    if (m.lvBuffer.size() < size) m.lvBuffer.resize(size);
    SDK::CrImageDataBlock block;
    block.SetSize(size);
    block.SetData(m.lvBuffer.data());
    // CrWarning_Frame_NotUpdated: no new frame since the last call.
    if (SDK::GetLiveViewImage(m.handle, &block) != SDK::CrError_None || block.GetImageSize() == 0) return false;
    out.assign(block.GetImageData(), block.GetImageData() + block.GetImageSize());
    return true;
}

bool SonyCamera::nearestSettable(uint32_t code, const std::function<double(uint64_t)>& score, uint64_t& out, uint32_t& type) {
    Impl& m = *impl_;
    SDK::CrDeviceProperty* list = nullptr;
    CrInt32 n = 0;
    CrInt32u c = code;
    if (SDK::GetSelectDeviceProperties(m.handle, 1, &c, &list, &n) != SDK::CrError_None || !list || n < 1) return false;
    const SDK::CrDeviceProperty& p = list[0];
    bool found = false;
    type = p.GetValueType();
    if (p.IsSetEnableCurrentValue()) {
        const uint32_t es = elementSize(type);
        const uint32_t bytes = p.GetSetValueSize() ? p.GetSetValueSize() : p.GetValueSize();
        if (es && (type & SDK::CrDataType_ArrayBit) && bytes >= es) {
            double best = std::numeric_limits<double>::max();
            for (uint32_t i = 0; i < bytes / es; ++i) {
                const uint64_t cand = arrayValue(p, i);
                const double sc = score(cand);
                if (sc < best) { best = sc; out = cand; found = true; }
            }
        } else if (es && bytes >= 3 * es) {
            // Range type: [min, max, step]
            const uint64_t mn = arrayValue(p, 0), mx = arrayValue(p, 1), st = std::max<uint64_t>(arrayValue(p, 2), 1);
            double best = std::numeric_limits<double>::max();
            // Coarse search is fine: ranges here are small (colour temp in 100K steps).
            for (uint64_t cand = mn; cand <= mx; cand += st) {
                const double sc = score(cand);
                if (sc < best) { best = sc; out = cand; found = true; }
            }
        }
    }
    SDK::ReleaseDeviceProperties(m.handle, list);
    return found;
}

bool SonyCamera::setProperty(uint32_t code, uint64_t value, uint32_t valueType, std::string& error) {
    SDK::CrDeviceProperty prop;
    prop.SetCode(code);
    prop.SetCurrentValue(value);
    prop.SetValueType(static_cast<SDK::CrDataType>(valueType));
    const SDK::CrError err = SDK::SetDeviceProperty(impl_->handle, &prop);
    if (err != SDK::CrError_None) {
        char b[64];
        std::snprintf(b, sizeof b, "SetDeviceProperty(0x%x) failed: 0x%x", code, err);
        error = b;
        return false;
    }
    impl_->propsDirty = true;
    return true;
}

bool SonyCamera::apply(const CameraAdjustment& adj, std::string& error) {
    if (!impl_->connected) { error = "not connected"; return false; }
    uint64_t value = 0;
    uint32_t type = 0;
    auto setNearest = [&](uint32_t code, const std::function<double(uint64_t)>& score, const char* what) {
        if (!nearestSettable(code, score, value, type)) {
            error = std::string(what) + " is not settable from remote in the current camera mode";
            return false;
        }
        return setProperty(code, value, type, error);
    };
    const CameraState cur = state();
    switch (adj.property) {
        case CameraAdjustment::Property::FNumber: {
            // Prefer T-number on cinema lenses that report it.
            const uint32_t code = cur.tStop > 0 ? SDK::CrDeviceProperty_TNumber : SDK::CrDeviceProperty_FNumber;
            return setNearest(code, [&](uint64_t c) {
                if (c == 0 || c >= 0xFFFD) return 1e9;
                return std::fabs(std::log2((c / 100.0) / adj.value));
            }, "Iris");
        }
        case CameraAdjustment::Property::Iso:
            return setNearest(SDK::CrDeviceProperty_IsoSensitivity, [&](uint64_t c) {
                const uint32_t iso = static_cast<uint32_t>(c) & 0x00FFFFFF;
                const uint32_t mode = (static_cast<uint32_t>(c) >> 24) & 0x0F;
                if (iso == SDK::CrISO_AUTO || iso == 0 || mode != SDK::CrISO_Normal) return 1e9;
                return std::fabs(std::log2(iso / adj.value));
            }, "ISO");
        case CameraAdjustment::Property::ShutterSeconds:
            return setNearest(SDK::CrDeviceProperty_ShutterSpeed, [&](uint64_t c) {
                const uint32_t num = static_cast<uint32_t>(c) >> 16, den = static_cast<uint32_t>(c) & 0xFFFF;
                if (!num || !den) return 1e9;
                return std::fabs(std::log2((static_cast<double>(num) / den) / adj.value));
            }, "Shutter");
        case CameraAdjustment::Property::ShutterAngle: {
            // Angle mode if the body supports it, otherwise convert to a speed.
            std::string angleErr;
            if (nearestSettable(SDK::CrDeviceProperty_ShutterAngle, [&](uint64_t c) {
                    return c == SDK::CrShutterAngle_Disable ? 1e9 : std::fabs(c / 1000.0 - adj.value);
                }, value, type))
                return setProperty(SDK::CrDeviceProperty_ShutterAngle, value, type, error);
            if (cur.frameRate <= 0) { error = "unknown frame rate; cannot convert angle to speed"; return false; }
            CameraAdjustment speed = adj;
            speed.property = CameraAdjustment::Property::ShutterSeconds;
            speed.value = math::shutterSecondsFromAngle(adj.value, cur.frameRate);
            return apply(speed, error);
        }
        case CameraAdjustment::Property::WhiteBalanceK: {
            if (cur.whiteBalanceAuto || cur.whiteBalanceK <= 0) {
                std::string e;
                setProperty(SDK::CrDeviceProperty_WhiteBalance, SDK::CrWhiteBalance_ColorTemp, SDK::CrDataType_UInt16Array, e);
                std::this_thread::sleep_for(std::chrono::milliseconds(200));
            }
            return setNearest(SDK::CrDeviceProperty_Colortemp, [&](uint64_t c) { return std::fabs(static_cast<double>(c) - adj.value); },
                              "Colour temperature");
        }
        case CameraAdjustment::Property::NdStops: {
            // Variable ND bodies (FX6/FX9/BURANO) expose optical density; others transmittance.
            if (nearestSettable(SDK::CrDeviceProperty_NDFilterOpticalDensityValue, [&](uint64_t c) {
                    return c >= 0xFFFF ? 1e9 : std::fabs(math::ndDensityToStops(c / 100.0) - adj.value);
                }, value, type))
                return setProperty(SDK::CrDeviceProperty_NDFilterOpticalDensityValue, value, type, error);
            return setNearest(SDK::CrDeviceProperty_NDFilterValue, [&](uint64_t c) {
                const uint32_t num = static_cast<uint32_t>(c >> 32), den = static_cast<uint32_t>(c);
                if (!num || !den) return 1e9;
                return std::fabs(std::log2(static_cast<double>(den) / num) - adj.value);
            }, "ND filter (body has no built-in ND — use matte-box ND)");
        }
        case CameraAdjustment::Property::FrameRate:
            return setNearest(SDK::CrDeviceProperty_Movie_Recording_FrameRateSetting, [&](uint64_t c) {
                const double fr = frameRateFromSetting(c);
                return fr > 0 ? std::fabs(fr - adj.value) : 1e9;
            }, "Frame rate");
    }
    error = "unsupported adjustment";
    return false;
}

bool SonyCamera::startRecording(std::string& error) {
    if (!impl_->connected) { error = "not connected"; return false; }
    SDK::CrError err = SDK::SendCommand(impl_->handle, SDK::CrCommandId_MovieRecord, SDK::CrCommandParam_Down);
    if (!err && toggleRecordModel(impl_->model)) err = SDK::SendCommand(impl_->handle, SDK::CrCommandId_MovieRecord, SDK::CrCommandParam_Up);
    if (err) { error = "MovieRecord start failed"; return false; }
    impl_->propsDirty = true;
    return true;
}

bool SonyCamera::stopRecording(std::string& error) {
    if (!impl_->connected) { error = "not connected"; return false; }
    SDK::CrError err = SDK::CrError_None;
    // Toggle-style bodies stop on a fresh Down/Up press; the rest stop on Up.
    if (toggleRecordModel(impl_->model)) err = SDK::SendCommand(impl_->handle, SDK::CrCommandId_MovieRecord, SDK::CrCommandParam_Down);
    if (!err) err = SDK::SendCommand(impl_->handle, SDK::CrCommandId_MovieRecord, SDK::CrCommandParam_Up);
    if (err) { error = "MovieRecord stop failed"; return false; }
    impl_->propsDirty = true;
    return true;
}

} // namespace cineassist
