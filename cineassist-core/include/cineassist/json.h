// CineAssist Core — minimal JSON DOM.
//
// Dependency-free so the core builds with any embedded toolchain. Supports the
// full JSON grammar (RFC 8259) including \uXXXX escapes and surrogate pairs.
// Parsing never throws: errors are reported through the `error` out-param.
#pragma once

#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace cineassist::json {

class Value {
public:
    enum class Type { Null, Bool, Number, String, Array, Object };

    Value() = default;
    Value(std::nullptr_t) {}
    Value(bool b) : type_(Type::Bool), bool_(b) {}
    Value(int n) : type_(Type::Number), num_(n) {}
    Value(int64_t n) : type_(Type::Number), num_(static_cast<double>(n)) {}
    Value(double n) : type_(Type::Number), num_(n) {}
    Value(const char* s) : type_(Type::String), str_(s) {}
    Value(std::string s) : type_(Type::String), str_(std::move(s)) {}

    static Value array() { Value v; v.type_ = Type::Array; return v; }
    static Value object() { Value v; v.type_ = Type::Object; return v; }

    Type type() const { return type_; }
    bool isNull() const { return type_ == Type::Null; }
    bool isBool() const { return type_ == Type::Bool; }
    bool isNumber() const { return type_ == Type::Number; }
    bool isString() const { return type_ == Type::String; }
    bool isArray() const { return type_ == Type::Array; }
    bool isObject() const { return type_ == Type::Object; }

    // Lenient accessors: return `fallback` when the type does not match.
    // Numbers stored as strings ("800") are converted, as the web app is not strict.
    bool asBool(bool fallback = false) const;
    double asNumber(double fallback = 0) const;
    int asInt(int fallback = 0) const;
    std::string asString(const std::string& fallback = "") const;

    // Object access. Missing keys return a shared null value.
    const Value& operator[](const std::string& key) const;
    Value& set(const std::string& key, Value v);
    bool has(const std::string& key) const;
    const std::vector<std::pair<std::string, Value>>& members() const { return obj_; }

    // Array access. Out-of-range returns a shared null value.
    const Value& operator[](size_t i) const;
    Value& push(Value v);
    size_t size() const;
    const std::vector<Value>& items() const { return arr_; }

    std::string dump(int indent = -1) const;  // -1 = compact

private:
    void dumpTo(std::string& out, int indent, int depth) const;

    Type type_ = Type::Null;
    bool bool_ = false;
    double num_ = 0;
    std::string str_;
    std::vector<Value> arr_;
    // Insertion-ordered so files we write stay diff-friendly.
    std::vector<std::pair<std::string, Value>> obj_;
};

// Parse `text`. On failure returns null and fills `error` with "line:col: message".
Value parse(const std::string& text, std::string* error = nullptr);

bool readFile(const std::string& path, std::string& out);
bool writeFile(const std::string& path, const std::string& data);

} // namespace cineassist::json
