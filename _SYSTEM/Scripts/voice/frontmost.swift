#!/usr/bin/env swift
// frontmost.swift — frontmost (focused) app + window title → JSON via NSWorkspace.
// Title via Accessibility API (focused window) with a CGWindowList fallback. Fail-open on denial.
// Usage: swift frontmost.swift   (or: swiftc frontmost.swift -o frontmost && ./frontmost)
import Cocoa
import Foundation

func err(_ m: String) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(1) }

struct Frontmost: Codable { let app: String; let title: String; let bundle: String }

guard let a = NSWorkspace.shared.frontmostApplication else { err("error: no frontmost application") }
let pid = a.processIdentifier

func axTitle() -> String? {
    let app = AXUIElementCreateApplication(pid)
    var focused: CFTypeRef?
    guard AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &focused) == .success, let win = focused else { return nil }
    var t: CFTypeRef?
    if AXUIElementCopyAttributeValue(win as! AXUIElement, kAXTitleAttribute as CFString, &t) == .success, let s = t as? String, !s.isEmpty { return s }
    return nil
}

func cgTitle() -> String? {
    guard let info = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] else { return nil }
    for d in info {
        guard let opid = d[kCGWindowOwnerPID as String] as? Int, opid == Int(pid),
              (d[kCGWindowLayer as String] as? Int) == 0 else { continue }
        if let t = d[kCGWindowName as String] as? String, !t.isEmpty { return t }
    }
    return nil
}

let out = Frontmost(app: a.localizedName ?? "", title: axTitle() ?? cgTitle() ?? "", bundle: a.bundleIdentifier ?? "")
let enc = JSONEncoder(); enc.outputFormatting = .withoutEscapingSlashes
guard let data = try? enc.encode(out) else { err("error: JSON encode failed") }
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
