#include "cineassist/json.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>

namespace cineassist::json {

namespace {

const Value& nullValue() {
    static const Value kNull;
    return kNull;
}

void appendUtf8(std::string& out, uint32_t cp) {
    if (cp < 0x80) {
        out.push_back(static_cast<char>(cp));
    } else if (cp < 0x800) {
        out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp < 0x10000) {
        out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else {
        out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    }
}

void escapeString(std::string& out, const std::string& s) {
    out.push_back('"');
    for (unsigned char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof buf, "\\u%04x", c);
                    out += buf;
                } else {
                    out.push_back(static_cast<char>(c));
                }
        }
    }
    out.push_back('"');
}

class Parser {
public:
    explicit Parser(const std::string& text) : s_(text) {}

    Value run(std::string* error) {
        Value v;
        skipWs();
        if (!parseValue(v, 0)) return fail(error);
        skipWs();
        if (pos_ != s_.size()) { err_ = "unexpected trailing characters"; return fail(error); }
        return v;
    }

private:
    static constexpr int kMaxDepth = 256;

    Value fail(std::string* error) {
        if (error) {
            int line = 1, col = 1;
            for (size_t i = 0; i < pos_ && i < s_.size(); ++i) {
                if (s_[i] == '\n') { ++line; col = 1; } else { ++col; }
            }
            *error = std::to_string(line) + ":" + std::to_string(col) + ": " + err_;
        }
        return Value();
    }

    void skipWs() {
        while (pos_ < s_.size() && (s_[pos_] == ' ' || s_[pos_] == '\t' || s_[pos_] == '\n' || s_[pos_] == '\r')) ++pos_;
    }

    bool literal(const char* word) {
        size_t n = 0;
        while (word[n]) ++n;
        if (s_.compare(pos_, n, word) != 0) { err_ = "invalid literal"; return false; }
        pos_ += n;
        return true;
    }

    bool parseValue(Value& out, int depth) {
        if (depth > kMaxDepth) { err_ = "nesting too deep"; return false; }
        if (pos_ >= s_.size()) { err_ = "unexpected end of input"; return false; }
        switch (s_[pos_]) {
            case 'n': if (!literal("null")) return false; out = Value(); return true;
            case 't': if (!literal("true")) return false; out = Value(true); return true;
            case 'f': if (!literal("false")) return false; out = Value(false); return true;
            case '"': { std::string str; if (!parseString(str)) return false; out = Value(std::move(str)); return true; }
            case '[': return parseArray(out, depth);
            case '{': return parseObject(out, depth);
            default: return parseNumber(out);
        }
    }

    bool parseNumber(Value& out) {
        const size_t start = pos_;
        if (pos_ < s_.size() && s_[pos_] == '-') ++pos_;
        if (pos_ >= s_.size() || !(s_[pos_] >= '0' && s_[pos_] <= '9')) { err_ = "invalid value"; return false; }
        while (pos_ < s_.size() && s_[pos_] >= '0' && s_[pos_] <= '9') ++pos_;
        if (pos_ < s_.size() && s_[pos_] == '.') {
            ++pos_;
            if (pos_ >= s_.size() || !(s_[pos_] >= '0' && s_[pos_] <= '9')) { err_ = "invalid number"; return false; }
            while (pos_ < s_.size() && s_[pos_] >= '0' && s_[pos_] <= '9') ++pos_;
        }
        if (pos_ < s_.size() && (s_[pos_] == 'e' || s_[pos_] == 'E')) {
            ++pos_;
            if (pos_ < s_.size() && (s_[pos_] == '+' || s_[pos_] == '-')) ++pos_;
            if (pos_ >= s_.size() || !(s_[pos_] >= '0' && s_[pos_] <= '9')) { err_ = "invalid exponent"; return false; }
            while (pos_ < s_.size() && s_[pos_] >= '0' && s_[pos_] <= '9') ++pos_;
        }
        out = Value(std::strtod(s_.c_str() + start, nullptr));
        return true;
    }

    bool hex4(uint32_t& cp) {
        if (pos_ + 4 > s_.size()) { err_ = "truncated \\u escape"; return false; }
        cp = 0;
        for (int i = 0; i < 4; ++i) {
            const char c = s_[pos_++];
            cp <<= 4;
            if (c >= '0' && c <= '9') cp |= static_cast<uint32_t>(c - '0');
            else if (c >= 'a' && c <= 'f') cp |= static_cast<uint32_t>(c - 'a' + 10);
            else if (c >= 'A' && c <= 'F') cp |= static_cast<uint32_t>(c - 'A' + 10);
            else { err_ = "invalid \\u escape"; return false; }
        }
        return true;
    }

    bool parseString(std::string& out) {
        ++pos_;  // opening quote
        while (pos_ < s_.size()) {
            const char c = s_[pos_++];
            if (c == '"') return true;
            if (static_cast<unsigned char>(c) < 0x20) { err_ = "control character in string"; return false; }
            if (c != '\\') { out.push_back(c); continue; }
            if (pos_ >= s_.size()) break;
            const char e = s_[pos_++];
            switch (e) {
                case '"': out.push_back('"'); break;
                case '\\': out.push_back('\\'); break;
                case '/': out.push_back('/'); break;
                case 'b': out.push_back('\b'); break;
                case 'f': out.push_back('\f'); break;
                case 'n': out.push_back('\n'); break;
                case 'r': out.push_back('\r'); break;
                case 't': out.push_back('\t'); break;
                case 'u': {
                    uint32_t cp = 0;
                    if (!hex4(cp)) return false;
                    if (cp >= 0xD800 && cp <= 0xDBFF) {
                        if (pos_ + 2 <= s_.size() && s_[pos_] == '\\' && s_[pos_ + 1] == 'u') {
                            pos_ += 2;
                            uint32_t lo = 0;
                            if (!hex4(lo)) return false;
                            if (lo < 0xDC00 || lo > 0xDFFF) { err_ = "invalid surrogate pair"; return false; }
                            cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                        } else {
                            cp = 0xFFFD;
                        }
                    }
                    appendUtf8(out, cp);
                    break;
                }
                default: err_ = "invalid escape"; return false;
            }
        }
        err_ = "unterminated string";
        return false;
    }

    bool parseArray(Value& out, int depth) {
        ++pos_;
        out = Value::array();
        skipWs();
        if (pos_ < s_.size() && s_[pos_] == ']') { ++pos_; return true; }
        while (true) {
            Value item;
            skipWs();
            if (!parseValue(item, depth + 1)) return false;
            out.push(std::move(item));
            skipWs();
            if (pos_ >= s_.size()) { err_ = "unterminated array"; return false; }
            if (s_[pos_] == ',') { ++pos_; continue; }
            if (s_[pos_] == ']') { ++pos_; return true; }
            err_ = "expected ',' or ']'";
            return false;
        }
    }

    bool parseObject(Value& out, int depth) {
        ++pos_;
        out = Value::object();
        skipWs();
        if (pos_ < s_.size() && s_[pos_] == '}') { ++pos_; return true; }
        while (true) {
            skipWs();
            if (pos_ >= s_.size() || s_[pos_] != '"') { err_ = "expected object key"; return false; }
            std::string key;
            if (!parseString(key)) return false;
            skipWs();
            if (pos_ >= s_.size() || s_[pos_] != ':') { err_ = "expected ':'"; return false; }
            ++pos_;
            skipWs();
            Value v;
            if (!parseValue(v, depth + 1)) return false;
            out.set(key, std::move(v));
            skipWs();
            if (pos_ >= s_.size()) { err_ = "unterminated object"; return false; }
            if (s_[pos_] == ',') { ++pos_; continue; }
            if (s_[pos_] == '}') { ++pos_; return true; }
            err_ = "expected ',' or '}'";
            return false;
        }
    }

    const std::string& s_;
    size_t pos_ = 0;
    std::string err_;
};

} // namespace

bool Value::asBool(bool fallback) const {
    if (type_ == Type::Bool) return bool_;
    if (type_ == Type::Number) return num_ != 0;
    if (type_ == Type::String) return str_ == "true" || str_ == "1";
    return fallback;
}

double Value::asNumber(double fallback) const {
    if (type_ == Type::Number) return num_;
    if (type_ == Type::String && !str_.empty()) {
        char* end = nullptr;
        const double v = std::strtod(str_.c_str(), &end);
        if (end != str_.c_str()) return v;
    }
    if (type_ == Type::Bool) return bool_ ? 1 : 0;
    return fallback;
}

int Value::asInt(int fallback) const {
    const double v = asNumber(static_cast<double>(fallback));
    return static_cast<int>(std::lround(v));
}

std::string Value::asString(const std::string& fallback) const {
    if (type_ == Type::String) return str_;
    if (type_ == Type::Number) {
        char buf[32];
        if (std::fabs(num_ - std::round(num_)) < 1e-9 && std::fabs(num_) < 1e15) std::snprintf(buf, sizeof buf, "%.0f", num_);
        else std::snprintf(buf, sizeof buf, "%g", num_);
        return buf;
    }
    if (type_ == Type::Bool) return bool_ ? "true" : "false";
    return fallback;
}

const Value& Value::operator[](const std::string& key) const {
    if (type_ != Type::Object) return nullValue();
    for (const auto& kv : obj_) if (kv.first == key) return kv.second;
    return nullValue();
}

Value& Value::set(const std::string& key, Value v) {
    if (type_ != Type::Object) { *this = object(); }
    for (auto& kv : obj_) {
        if (kv.first == key) { kv.second = std::move(v); return kv.second; }
    }
    obj_.emplace_back(key, std::move(v));
    return obj_.back().second;
}

bool Value::has(const std::string& key) const {
    if (type_ != Type::Object) return false;
    for (const auto& kv : obj_) if (kv.first == key) return true;
    return false;
}

const Value& Value::operator[](size_t i) const {
    if (type_ != Type::Array || i >= arr_.size()) return nullValue();
    return arr_[i];
}

Value& Value::push(Value v) {
    if (type_ != Type::Array) { *this = array(); }
    arr_.push_back(std::move(v));
    return arr_.back();
}

size_t Value::size() const {
    if (type_ == Type::Array) return arr_.size();
    if (type_ == Type::Object) return obj_.size();
    return 0;
}

std::string Value::dump(int indent) const {
    std::string out;
    dumpTo(out, indent, 0);
    return out;
}

void Value::dumpTo(std::string& out, int indent, int depth) const {
    auto newline = [&](int d) {
        if (indent < 0) return;
        out.push_back('\n');
        out.append(static_cast<size_t>(indent * d), ' ');
    };
    switch (type_) {
        case Type::Null: out += "null"; break;
        case Type::Bool: out += bool_ ? "true" : "false"; break;
        case Type::Number: {
            if (!std::isfinite(num_)) { out += "null"; break; }
            char buf[32];
            if (std::fabs(num_ - std::round(num_)) < 1e-9 && std::fabs(num_) < 1e15) std::snprintf(buf, sizeof buf, "%.0f", num_);
            else std::snprintf(buf, sizeof buf, "%.10g", num_);
            out += buf;
            break;
        }
        case Type::String: escapeString(out, str_); break;
        case Type::Array:
            out.push_back('[');
            for (size_t i = 0; i < arr_.size(); ++i) {
                if (i) out.push_back(',');
                newline(depth + 1);
                arr_[i].dumpTo(out, indent, depth + 1);
            }
            if (!arr_.empty()) newline(depth);
            out.push_back(']');
            break;
        case Type::Object:
            out.push_back('{');
            for (size_t i = 0; i < obj_.size(); ++i) {
                if (i) out.push_back(',');
                newline(depth + 1);
                escapeString(out, obj_[i].first);
                out += indent < 0 ? ":" : ": ";
                obj_[i].second.dumpTo(out, indent, depth + 1);
            }
            if (!obj_.empty()) newline(depth);
            out.push_back('}');
            break;
    }
}

Value parse(const std::string& text, std::string* error) {
    Parser p(text);
    return p.run(error);
}

bool readFile(const std::string& path, std::string& out) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return false;
    std::ostringstream ss;
    ss << f.rdbuf();
    out = ss.str();
    return true;
}

bool writeFile(const std::string& path, const std::string& data) {
    // Write to a temp file then rename, so a power cut on set never leaves a half file.
    const std::string tmp = path + ".tmp";
    {
        std::ofstream f(tmp, std::ios::binary | std::ios::trunc);
        if (!f) return false;
        f.write(data.data(), static_cast<std::streamsize>(data.size()));
        if (!f) return false;
    }
    return std::rename(tmp.c_str(), path.c_str()) == 0;
}

} // namespace cineassist::json
