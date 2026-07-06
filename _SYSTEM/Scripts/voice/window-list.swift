#!/usr/bin/env swift
// window-list.swift — list on-screen windows via CGWindowListCopyWindowInfo → JSON
// Usage: swift window-list.swift        (or: swiftc window-list.swift -o window-list && ./window-list)
// Emits one JSON array of {windowID,app,title,x,y,w,h,layer} per run to stdout.
// The windowID feeds `screencapture -l<windowID>` for targeted capture.

import Cocoa
import Foundation

struct WindowInfo: Codable {
    let windowID: Int
    let app: String
    let title: String?
    let x: Int
    let y: Int
    let w: Int
    let h: Int
    let layer: Int
}

guard let info = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] else {
    FileHandle.standardError.write("error: CGWindowListCopyWindowInfo failed\n".data(using: .utf8)!)
    exit(1)
}

func err(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

var windows: [WindowInfo] = []
for d in info {
    guard let windowID = d[kCGWindowNumber as String] as? Int,
          let app = d[kCGWindowOwnerName as String] as? String,
          let layer = d[kCGWindowLayer as String] as? Int else { continue }
    let title = d[kCGWindowName as String] as? String
    // skip non-app windows (desktop/menubar/dashboard) unless they carry a title
    if layer != 0 && (title?.isEmpty ?? true) { continue }
    let b = d[kCGWindowBounds as String] as? [String: Any] ?? [:]
    func n(_ k: String) -> Int { Int((b[k] as? Double) ?? 0) }
    windows.append(WindowInfo(windowID: windowID, app: app, title: title,
                              x: n("X"), y: n("Y"), w: n("Width"), h: n("Height"), layer: layer))
}

let enc = JSONEncoder()
enc.outputFormatting = .withoutEscapingSlashes
guard let data = try? enc.encode(windows) else { err("error: JSON encode failed") }
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
