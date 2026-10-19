cmake_minimum_required(VERSION 3.16)
project(CineAssistCore VERSION 1.0.0 LANGUAGES C CXX)

# ─── Options ───────────────────────────────────────────────────────────────────
option(CINEASSIST_BUILD_APPS   "Build the cineassist-onset CLI"                  ON)
option(CINEASSIST_BUILD_TESTS  "Build unit tests"                                ON)
option(CINEASSIST_BUILD_SHARED "Build libcineassist shared library (C ABI)"      ON)
set(CINEASSIST_SONY_SDK_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../CrSDK_v2.02.00_20260610a_Mac/extracted/SimpleCli"
    CACHE PATH "Sony Camera Remote SDK sample dir containing app/CRSDK and external/crsdk")
option(CINEASSIST_WITH_SONY    "Build the Sony Camera Remote SDK backend (auto-off if SDK not found)" ON)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()
if(APPLE)
  set(CMAKE_OSX_DEPLOYMENT_TARGET "12.1" CACHE STRING "Minimum macOS version")
endif()

if(MSVC)
  add_compile_options(/W4 /permissive-)
else()
  add_compile_options(-Wall -Wextra -Wpedantic -Wno-unused-parameter)
endif()

# ─── Core: portable, no OS or SDK dependencies (this is what goes into firmware) ──
add_library(cineassist_core STATIC
  src/camera_math.cpp
  src/json.cpp
  src/types.cpp
  src/project.cpp
  src/frame_analyzer.cpp
  src/guidance_engine.cpp
  src/session.cpp
  src/camera_registry.cpp
  src/image_decode.cpp
  src/cineassist_c.cpp
)
target_include_directories(cineassist_core
  PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/include
  PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/third_party)
# stb_image is third-party; don't hold it to our warning level.
set_source_files_properties(src/image_decode.cpp PROPERTIES COMPILE_OPTIONS "$<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-w>")
find_package(Threads REQUIRED)
target_link_libraries(cineassist_core PUBLIC Threads::Threads)

# ─── Optional shared library exposing only the C ABI ──────────────────────────
if(CINEASSIST_BUILD_SHARED)
  add_library(cineassist SHARED src/cineassist_c.cpp)
  target_compile_definitions(cineassist PUBLIC CINEASSIST_SHARED)
  target_link_libraries(cineassist PRIVATE cineassist_core)
  set_target_properties(cineassist PROPERTIES
    CXX_VISIBILITY_PRESET hidden VISIBILITY_INLINES_HIDDEN ON
    VERSION ${PROJECT_VERSION} SOVERSION ${PROJECT_VERSION_MAJOR})
endif()

# ─── Camera backends ───────────────────────────────────────────────────────────
set(_sony_found OFF)
if(CINEASSIST_WITH_SONY)
  if(EXISTS "${CINEASSIST_SONY_SDK_DIR}/app/CRSDK/CameraRemote_SDK.h")
    find_library(CRSDK_CORE_LIB Cr_Core HINTS "${CINEASSIST_SONY_SDK_DIR}/external/crsdk" NO_DEFAULT_PATH)
    if(CRSDK_CORE_LIB)
      set(_sony_found ON)
    endif()
  endif()
  if(NOT _sony_found)
    message(STATUS "Sony CrSDK not found at ${CINEASSIST_SONY_SDK_DIR} — building without the 'sony' backend")
  endif()
endif()

add_library(cineassist_backends STATIC
  backends/builtin_backends.cpp
  backends/sim/sim_camera.cpp)
target_include_directories(cineassist_backends PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/backends)
target_link_libraries(cineassist_backends PUBLIC cineassist_core)

if(_sony_found)
  message(STATUS "Sony CrSDK backend: ON (${CRSDK_CORE_LIB})")
  target_sources(cineassist_backends PRIVATE backends/sony/sony_camera.cpp)
  target_include_directories(cineassist_backends SYSTEM PRIVATE "${CINEASSIST_SONY_SDK_DIR}/app/CRSDK")
  target_compile_definitions(cineassist_backends PUBLIC CINEASSIST_WITH_SONY=1)
  target_link_libraries(cineassist_backends PUBLIC ${CRSDK_CORE_LIB})
  if(WIN32)
    target_compile_definitions(cineassist_backends PRIVATE UNICODE _UNICODE)
  endif()
  # The SDK's headers are not warning-clean.
  set_source_files_properties(backends/sony/sony_camera.cpp PROPERTIES COMPILE_OPTIONS "$<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wno-pedantic>")
else()
  target_compile_definitions(cineassist_backends PUBLIC CINEASSIST_WITH_SONY=0)
endif()

# Copy the CrSDK runtime next to an executable, using the layout the SDK expects.
function(cineassist_deploy_crsdk target)
  if(NOT _sony_found)
    return()
  endif()
  set(_lib_dir "${CINEASSIST_SONY_SDK_DIR}/external/crsdk")
  if(APPLE)
    add_custom_command(TARGET ${target} POST_BUILD
      COMMAND ${CMAKE_COMMAND} -E copy_directory ${_lib_dir} $<TARGET_FILE_DIR:${target}>
      COMMAND ${CMAKE_COMMAND} -E make_directory $<TARGET_FILE_DIR:${target}>/Contents/Frameworks/CrAdapter
      COMMAND ${CMAKE_COMMAND} -E copy_directory ${_lib_dir}/CrAdapter $<TARGET_FILE_DIR:${target}>/Contents/Frameworks/CrAdapter
      COMMAND ${CMAKE_COMMAND} -E rm -rf $<TARGET_FILE_DIR:${target}>/CrAdapter)
    set_target_properties(${target} PROPERTIES BUILD_RPATH "@executable_path")
  else()
    add_custom_command(TARGET ${target} POST_BUILD
      COMMAND ${CMAKE_COMMAND} -E copy_directory ${_lib_dir} $<TARGET_FILE_DIR:${target}>)
    if(NOT WIN32)
      set_target_properties(${target} PROPERTIES BUILD_RPATH "$ORIGIN" INSTALL_RPATH "$ORIGIN")
    endif()
  endif()
endfunction()

# ─── Apps ──────────────────────────────────────────────────────────────────────
if(CINEASSIST_BUILD_APPS)
  add_executable(cineassist-onset apps/cineassist_onset.cpp apps/onset_runtime.cpp apps/http_bridge.cpp)
  target_link_libraries(cineassist-onset PRIVATE cineassist_backends)
  target_include_directories(cineassist-onset SYSTEM PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/third_party)
  cineassist_deploy_crsdk(cineassist-onset)

  # Pure-C firmware integration example: proves the C ABI needs no C++ on the host side.
  add_executable(firmware_integration_example examples/firmware_integration.c)
  target_link_libraries(firmware_integration_example PRIVATE cineassist_core)
  set_target_properties(firmware_integration_example PROPERTIES LINKER_LANGUAGE CXX)
endif()

# ─── Tests ─────────────────────────────────────────────────────────────────────
if(CINEASSIST_BUILD_TESTS)
  enable_testing()
  add_executable(cineassist_tests tests/test_main.cpp)
  target_link_libraries(cineassist_tests PRIVATE cineassist_backends)
  target_compile_definitions(cineassist_tests PRIVATE
    CINEASSIST_EXAMPLES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/examples")
  add_test(NAME cineassist_tests COMMAND cineassist_tests)
  if(CINEASSIST_BUILD_APPS)
    add_test(NAME onset_cli_smoke
      COMMAND cineassist-onset --backend sim --project ${CMAKE_CURRENT_SOURCE_DIR}/examples/sample_project.json --once --json)
    add_test(NAME firmware_c_example
      COMMAND firmware_integration_example ${CMAKE_CURRENT_SOURCE_DIR}/examples/sample_project.json)
  endif()
endif()

# ─── Install ───────────────────────────────────────────────────────────────────
install(DIRECTORY include/ DESTINATION include)
install(TARGETS cineassist_core ARCHIVE DESTINATION lib)
if(CINEASSIST_BUILD_SHARED)
  install(TARGETS cineassist LIBRARY DESTINATION lib RUNTIME DESTINATION bin ARCHIVE DESTINATION lib)
endif()
if(CINEASSIST_BUILD_APPS)
  install(TARGETS cineassist-onset RUNTIME DESTINATION bin)
endif()
