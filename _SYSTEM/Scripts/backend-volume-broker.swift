#!/usr/bin/env swift

import Darwin
import Foundation
import Security

private let keychainService = "com.yuri-os-musubi.backend-runtime-image.v1"
private let keychainAccount = "volume-passphrase"
private let purpose = "yuri-backend-phase1"
private let hostMountPoint = "/Volumes/T7"
private let canonicalImagePath = "/Volumes/T7/YURI-Backend-Runtime-v1.sparsebundle"
private let canonicalRuntimeMountPoint = "/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/backend/data"
private let volumeName = "YURI Backend Runtime"
private let virtualSize = "256g"

private struct BrokerFailure: Error {
    let code: String
    let message: String
}

private struct ProcessResult {
    let status: Int32
    let stdout: Data
    let stderr: Data
}

private struct MountedVolume {
    let mountPoint: String
    let deviceIdentifier: String
    let wholeDiskIdentifier: String
    let volumeUUID: String
}

private struct MountPointIdentity {
    let device: dev_t
    let inode: ino_t
}

private struct ParsedArguments {
    let command: String
    let options: [String: String]
}

@inline(__always)
private func fail(_ code: String, _ message: String) throws -> Never {
    throw BrokerFailure(code: code, message: message)
}

private func wipe(_ data: inout Data) {
    data.withUnsafeMutableBytes { rawBuffer in
        guard let baseAddress = rawBuffer.baseAddress, rawBuffer.count > 0 else { return }
        memset(baseAddress, 0, rawBuffer.count)
    }
    data.removeAll(keepingCapacity: false)
}

private func safeText(_ data: Data, limit: Int = 2_000) -> String {
    let text = String(decoding: data.prefix(limit), as: UTF8.self)
    return text.replacingOccurrences(of: "\u{0}", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
}

private func runProcess(
    _ executable: String,
    _ arguments: [String],
    stdin: Data? = nil,
    timeoutSeconds: TimeInterval = 600
) throws -> ProcessResult {
    let process = Process()
    let stdoutPipe = Pipe()
    let stderrPipe = Pipe()
    let stdinPipe = Pipe()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    process.standardOutput = stdoutPipe
    process.standardError = stderrPipe
    process.standardInput = stdinPipe

    var input = stdin
    defer {
        if input != nil { wipe(&input!) }
    }

    do {
        try process.run()
        let childPID = process.processIdentifier
        _ = Darwin.setpgid(childPID, childPID)
        if let input {
            try stdinPipe.fileHandleForWriting.write(contentsOf: input)
        }
        try stdinPipe.fileHandleForWriting.close()
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if process.isRunning {
            if Darwin.kill(-childPID, SIGTERM) != 0 { _ = Darwin.kill(childPID, SIGTERM) }
            let graceDeadline = Date().addingTimeInterval(2)
            while process.isRunning && Date() < graceDeadline {
                Thread.sleep(forTimeInterval: 0.05)
            }
            if process.isRunning {
                if Darwin.kill(-childPID, SIGKILL) != 0 { _ = Darwin.kill(childPID, SIGKILL) }
            }
            process.waitUntilExit()
            _ = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
            _ = stderrPipe.fileHandleForReading.readDataToEndOfFile()
            throw BrokerFailure(code: "PROCESS_TIMEOUT", message: "fixed system operation exceeded its bounded runtime")
        }
        process.waitUntilExit()
        let stdout = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
        let stderr = stderrPipe.fileHandleForReading.readDataToEndOfFile()
        return ProcessResult(status: process.terminationStatus, stdout: stdout, stderr: stderr)
    } catch {
        try? stdinPipe.fileHandleForWriting.close()
        throw BrokerFailure(code: "PROCESS_START_FAILED", message: "unable to run a fixed system executable")
    }
}

private func requireSuccess(_ result: ProcessResult, code: String, operation: String) throws -> ProcessResult {
    guard result.status == 0 else {
        let detail = safeText(result.stderr)
        let suffix = detail.isEmpty ? "" : ": \(detail)"
        throw BrokerFailure(code: code, message: "\(operation) failed with status \(result.status)\(suffix)")
    }
    return result
}

private func propertyList(_ data: Data, operation: String) throws -> [String: Any] {
    do {
        let value = try PropertyListSerialization.propertyList(from: data, options: [], format: nil)
        guard let dictionary = value as? [String: Any] else {
            throw BrokerFailure(code: "PLIST_INVALID", message: "\(operation) returned a non-dictionary plist")
        }
        return dictionary
    } catch let error as BrokerFailure {
        throw error
    } catch {
        throw BrokerFailure(code: "PLIST_INVALID", message: "\(operation) returned an invalid plist")
    }
}

private func outputJSON(_ payload: [String: Any], to handle: FileHandle = .standardOutput) throws {
    guard JSONSerialization.isValidJSONObject(payload) else {
        throw BrokerFailure(code: "JSON_INVALID", message: "broker attempted to emit invalid JSON")
    }
    var data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
    data.append(0x0a)
    try handle.write(contentsOf: data)
}

private func normalizedUUID(_ value: String, field: String) throws -> String {
    guard UUID(uuidString: value) != nil else {
        throw BrokerFailure(code: "ARGUMENT_INVALID", message: "\(field) must be a UUID")
    }
    return value.uppercased()
}

private func normalizedAbsolutePath(_ value: String, field: String) throws -> String {
    guard !value.isEmpty, !value.contains("\u{0}"), value.hasPrefix("/") else {
        throw BrokerFailure(code: "ARGUMENT_INVALID", message: "\(field) must be an absolute path")
    }
    let components = value.split(separator: "/", omittingEmptySubsequences: false)
    let hasDotComponent = components.dropFirst().contains { $0 == "." || $0 == ".." }
    let hasEmptyInteriorComponent = components.dropFirst().dropLast().contains(where: { $0.isEmpty })
    guard !hasDotComponent,
          !hasEmptyInteriorComponent,
          value == "/" || !value.hasSuffix("/") else {
        throw BrokerFailure(code: "ARGUMENT_INVALID", message: "\(field) must already be normalized")
    }
    return value
}

private func parseArguments(_ raw: [String]) throws -> ParsedArguments {
    guard let command = raw.first else {
        throw BrokerFailure(code: "CLI_USAGE", message: "a broker command is required")
    }
    if command == "help" || command == "--help" || command == "-h" {
        return ParsedArguments(command: "help", options: [:])
    }

    var options: [String: String] = [:]
    var index = 1
    while index < raw.count {
        let flag = raw[index]
        guard flag.hasPrefix("--") else {
            throw BrokerFailure(code: "CLI_USAGE", message: "unexpected positional argument")
        }
        guard options[flag] == nil else {
            throw BrokerFailure(code: "CLI_USAGE", message: "duplicate option: \(flag)")
        }
        if flag == "--json" {
            options[flag] = "true"
            index += 1
            continue
        }
        guard index + 1 < raw.count, !raw[index + 1].hasPrefix("--") else {
            throw BrokerFailure(code: "CLI_USAGE", message: "missing value for \(flag)")
        }
        options[flag] = raw[index + 1]
        index += 2
    }
    return ParsedArguments(command: command, options: options)
}

private func requireOptions(_ parsed: ParsedArguments, _ required: Set<String>) throws {
    let actual = Set(parsed.options.keys)
    guard actual == required.union(["--json"]) else {
        let expected = required.union(["--json"]).sorted().joined(separator: ", ")
        throw BrokerFailure(code: "CLI_USAGE", message: "\(parsed.command) requires exactly: \(expected)")
    }
}

private func keychainBaseQuery() -> [String: Any] {
    return [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: keychainService,
        kSecAttrAccount as String: keychainAccount,
    ]
}

private func keyStatus() throws -> Bool {
    var query = keychainBaseQuery()
    query[kSecReturnAttributes as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecSuccess { return true }
    if status == errSecItemNotFound { return false }
    throw BrokerFailure(code: "KEYCHAIN_STATUS_FAILED", message: "Keychain status failed with OSStatus \(status)")
}

private func provisionKey() throws -> [String: Any] {
    guard try !keyStatus() else {
        throw BrokerFailure(code: "KEYCHAIN_ITEM_EXISTS", message: "the fixed Keychain item already exists; automatic rotation is forbidden")
    }

    var random = Data(count: 48)
    let randomStatus = random.withUnsafeMutableBytes { rawBuffer -> Int32 in
        guard let baseAddress = rawBuffer.baseAddress else { return errSecAllocate }
        return SecRandomCopyBytes(kSecRandomDefault, rawBuffer.count, baseAddress)
    }
    guard randomStatus == errSecSuccess else {
        wipe(&random)
        throw BrokerFailure(code: "RANDOM_FAILED", message: "SecRandomCopyBytes failed")
    }
    var secret = random.base64EncodedData()
    wipe(&random)
    defer { wipe(&secret) }

    var item = keychainBaseQuery()
    item[kSecAttrLabel as String] = "YURI Backend Runtime Image v1"
    item[kSecAttrDescription as String] = "AES-256 sparsebundle passphrase; managed only by the fixed YURI broker"
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    item[kSecValueData as String] = secret
    let status = SecItemAdd(item as CFDictionary, nil)
    guard status == errSecSuccess else {
        throw BrokerFailure(code: "KEYCHAIN_PROVISION_FAILED", message: "Keychain provision failed with OSStatus \(status)")
    }
    return [
        "ok": true,
        "created": true,
        "present": true,
        "service": keychainService,
        "account": keychainAccount,
    ]
}

private func fetchSecret() throws -> Data {
    var query = keychainBaseQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let secret = result as? Data, !secret.isEmpty else {
        throw BrokerFailure(code: "KEYCHAIN_READ_FAILED", message: "the fixed Keychain item is unavailable (OSStatus \(status))")
    }
    return secret
}

private func runHdiutilWithSecret(_ arguments: [String], operation: String) throws -> ProcessResult {
    var secret = try fetchSecret()
    defer { wipe(&secret) }
    var input = secret
    input.append(0)
    defer { wipe(&input) }
    let result = try runProcess("/usr/bin/hdiutil", arguments, stdin: input)
    guard result.status == 0 else {
        throw BrokerFailure(code: "HDIUTIL_FAILED", message: "\(operation) failed with status \(result.status)")
    }
    return result
}

private func existingRealPath(_ value: String, field: String) throws -> String {
    let normalized = try normalizedAbsolutePath(value, field: field)
    guard let resolvedPointer = normalized.withCString({ Darwin.realpath($0, nil) }) else {
        throw BrokerFailure(code: "PATH_INVALID", message: "\(field) must exist and resolve to a real path")
    }
    defer { Darwin.free(resolvedPointer) }
    let resolved = String(cString: resolvedPointer)
    guard resolved == normalized else {
        throw BrokerFailure(code: "PATH_SYMLINK_REFUSED", message: "\(field) must not traverse a symlink")
    }
    return normalized
}

private func requireDirectory(_ value: String, field: String) throws {
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: value, isDirectory: &isDirectory), isDirectory.boolValue else {
        throw BrokerFailure(code: "PATH_INVALID", message: "\(field) must be an existing directory")
    }
}

private func mountPointIdentity(_ value: String, field: String) throws -> MountPointIdentity {
    var status = stat()
    let result = value.withCString { pointer in
        Darwin.lstat(pointer, &status)
    }
    guard result == 0 else {
        throw BrokerFailure(code: "STAT_FAILED", message: "unable to inspect \(field)")
    }
    guard (status.st_mode & S_IFMT) == S_IFDIR else {
        throw BrokerFailure(code: "PATH_INVALID", message: "\(field) must be a real directory")
    }
    return MountPointIdentity(device: status.st_dev, inode: status.st_ino)
}

private func requireSameMountPointIdentity(
    _ value: String,
    expected: MountPointIdentity,
    field: String
) throws {
    let actual = try mountPointIdentity(value, field: field)
    guard actual.device == expected.device, actual.inode == expected.inode else {
        throw BrokerFailure(code: "MOUNTPOINT_IDENTITY_CHANGED", message: "\(field) changed during inspection")
    }
}

private func setMountPointMode(
    _ value: String,
    mode: mode_t,
    expected: MountPointIdentity,
    failureCode: String
) throws {
    try requireSameMountPointIdentity(value, expected: expected, field: "mountpoint")
    guard Darwin.chmod(value, mode) == 0 else {
        throw BrokerFailure(code: failureCode, message: "unable to set the exact mountpoint mode")
    }
    try requireSameMountPointIdentity(value, expected: expected, field: "mountpoint")
    var status = stat()
    guard Darwin.lstat(value, &status) == 0, (status.st_mode & 0o7777) == mode else {
        throw BrokerFailure(code: failureCode, message: "mountpoint mode did not match the required value")
    }
}

private func requireDescriptorIdentity(
    _ descriptor: Int32,
    expected: MountPointIdentity,
    field: String
) throws -> stat {
    var status = stat()
    guard Darwin.fstat(descriptor, &status) == 0,
          (status.st_mode & S_IFMT) == S_IFDIR,
          status.st_dev == expected.device,
          status.st_ino == expected.inode else {
        throw BrokerFailure(code: "MOUNTPOINT_IDENTITY_CHANGED", message: "\(field) changed during inspection")
    }
    return status
}

private func setDescriptorMode(
    _ descriptor: Int32,
    mode: mode_t,
    expected: MountPointIdentity,
    failureCode: String
) throws {
    _ = try requireDescriptorIdentity(descriptor, expected: expected, field: "mountpoint")
    guard Darwin.fchmod(descriptor, mode) == 0 else {
        throw BrokerFailure(code: failureCode, message: "unable to set the exact mountpoint mode")
    }
    let status = try requireDescriptorIdentity(descriptor, expected: expected, field: "mountpoint")
    guard (status.st_mode & 0o7777) == mode else {
        throw BrokerFailure(code: failureCode, message: "mountpoint mode did not match the required value")
    }
}

private func directoryStreamIsEmpty(_ stream: UnsafeMutablePointer<DIR>) throws -> Bool {
    Darwin.rewinddir(stream)
    errno = 0
    while let entry = Darwin.readdir(stream) {
        let name = withUnsafePointer(to: &entry.pointee.d_name) { pointer in
            pointer.withMemoryRebound(to: CChar.self, capacity: Int(MAXNAMLEN) + 1) {
                String(cString: $0)
            }
        }
        if name != ".", name != ".." { return false }
    }
    guard errno == 0 else {
        throw BrokerFailure(code: "MOUNTPOINT_INSPECTION_FAILED", message: "unable to enumerate the mountpoint")
    }
    return true
}

private func inspectAndSealEmptyDirectory(
    _ descriptor: Int32,
    expected: MountPointIdentity
) throws {
    let duplicate = Darwin.dup(descriptor)
    guard duplicate >= 0 else {
        throw BrokerFailure(code: "MOUNTPOINT_INSPECTION_FAILED", message: "unable to duplicate the mountpoint descriptor")
    }
    guard let stream = Darwin.fdopendir(duplicate) else {
        Darwin.close(duplicate)
        throw BrokerFailure(code: "MOUNTPOINT_INSPECTION_FAILED", message: "unable to open the mountpoint directory stream")
    }
    defer { Darwin.closedir(stream) }

    guard try directoryStreamIsEmpty(stream) else {
        throw BrokerFailure(code: "MOUNTPOINT_NOT_EMPTY", message: "refusing to hide a non-empty mountpoint")
    }
    try setDescriptorMode(descriptor, mode: 0, expected: expected, failureCode: "MOUNTPOINT_RESEAL_FAILED")
    guard try directoryStreamIsEmpty(stream) else {
        throw BrokerFailure(code: "MOUNTPOINT_NOT_EMPTY", message: "mountpoint changed while it was being resealed")
    }
}

private func validateBareMountPoint(_ value: String) throws -> (String, MountPointIdentity) {
    let mountPoint = try allowedMountPoint(value)
    let real = try existingRealPath(mountPoint, field: "mountpoint")
    try requireDirectory(real, field: "mountpoint")
    let identity = try mountPointIdentity(real, field: "mountpoint")
    let parent = URL(fileURLWithPath: real).deletingLastPathComponent().path
    let parentIdentity = try mountPointIdentity(parent, field: "mountpoint parent")
    guard identity.device == parentIdentity.device else {
        throw BrokerFailure(code: "BARE_LOCAL_FALLBACK", message: "bare mountpoint is not on its parent filesystem")
    }
    return (real, identity)
}

private func sealBareMountPoint(_ value: String) throws {
    let (real, identity) = try validateBareMountPoint(value)
    try setMountPointMode(real, mode: 0, expected: identity, failureCode: "MOUNTPOINT_RESEAL_FAILED")
}

private func diskutilInfo(_ target: String) throws -> [String: Any] {
    let result = try requireSuccess(
        runProcess("/usr/sbin/diskutil", ["info", "-plist", target]),
        code: "DISKUTIL_FAILED",
        operation: "diskutil info"
    )
    return try propertyList(result.stdout, operation: "diskutil info")
}

private func stringValue(_ dictionary: [String: Any], _ keys: [String]) -> String? {
    for key in keys {
        if let value = dictionary[key] as? String, !value.isEmpty { return value }
    }
    return nil
}

private func boolValue(_ dictionary: [String: Any], _ keys: [String]) -> Bool {
    for key in keys {
        if let value = dictionary[key] as? Bool { return value }
        if let value = dictionary[key] as? NSNumber { return value.boolValue }
    }
    return false
}

private func validateHost(expectedUUID: String) throws -> String {
    let expected = try normalizedUUID(expectedUUID, field: "expected-host-uuid")
    let realHost = try existingRealPath(hostMountPoint, field: "T7 mountpoint")
    try requireDirectory(realHost, field: "T7 mountpoint")
    let info = try diskutilInfo(realHost)
    let actualUUID = try normalizedUUID(stringValue(info, ["VolumeUUID"]) ?? "", field: "T7 VolumeUUID")
    guard actualUUID == expected else {
        throw BrokerFailure(code: "HOST_UUID_MISMATCH", message: "T7 UUID does not match the required pin")
    }
    guard stringValue(info, ["MountPoint"]) == hostMountPoint else {
        throw BrokerFailure(code: "HOST_MOUNT_MISMATCH", message: "the pinned T7 is not mounted at the exact canonical path")
    }
    guard stringValue(info, ["FilesystemType", "TypeBundle"])?.lowercased() == "exfat" else {
        throw BrokerFailure(code: "HOST_FILESYSTEM_MISMATCH", message: "the T7 host filesystem must be exFAT")
    }
    guard boolValue(info, ["Writable", "WritableVolume"]) else {
        throw BrokerFailure(code: "HOST_READ_ONLY", message: "the pinned T7 is not writable")
    }
    return actualUUID
}

private func validateImagePath(_ value: String, mustExist: Bool) throws -> String {
    let normalized = try normalizedAbsolutePath(value, field: "image")
    guard normalized == canonicalImagePath else {
        throw BrokerFailure(code: "IMAGE_PATH_REFUSED", message: "only the dedicated Phase-1 image path is accepted")
    }
    _ = try existingRealPath(hostMountPoint, field: "T7 mountpoint")
    if mustExist {
        let real = try existingRealPath(normalized, field: "image")
        try requireDirectory(real, field: "image")
    } else if FileManager.default.fileExists(atPath: normalized) {
        throw BrokerFailure(code: "IMAGE_EXISTS", message: "the dedicated Phase-1 image already exists; overwrite is forbidden")
    }
    return normalized
}

private func allowedMountPoint(_ value: String) throws -> String {
    let normalized = try normalizedAbsolutePath(value, field: "mountpoint")
    if normalized == canonicalRuntimeMountPoint { return normalized }
    let phaseOnePrefix = "/private/tmp/yuri-phase1-apfs-"
    let enrollmentPrefix = "/private/tmp/yuri-backend-broker-enroll-"
    let parent = URL(fileURLWithPath: normalized).deletingLastPathComponent().path
    guard URL(fileURLWithPath: normalized).lastPathComponent == "mount",
          parent.hasPrefix(phaseOnePrefix) || parent.hasPrefix(enrollmentPrefix) else {
        throw BrokerFailure(code: "MOUNTPOINT_REFUSED", message: "mountpoint is outside the canonical or broker-owned fixture paths")
    }
    return normalized
}

private func prepareEmptyMountPoint(_ value: String) throws -> String {
    let (real, identity) = try validateBareMountPoint(value)
    var descriptor: Int32 = -1
    do {
        // A detached canonical target is deliberately mode 000. Open it only for
        // this bounded emptiness inspection, then reseal the same inode before
        // hdiutil is allowed to run.
        try setMountPointMode(real, mode: 0o700, expected: identity, failureCode: "MOUNTPOINT_INSPECTION_FAILED")
        descriptor = Darwin.open(real, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard descriptor >= 0 else {
            throw BrokerFailure(code: "MOUNTPOINT_INSPECTION_FAILED", message: "unable to open the exact mountpoint")
        }
        _ = try requireDescriptorIdentity(descriptor, expected: identity, field: "mountpoint")
        try inspectAndSealEmptyDirectory(descriptor, expected: identity)
        Darwin.close(descriptor)
        descriptor = -1
        try requireSameMountPointIdentity(real, expected: identity, field: "mountpoint")
        var sealedStatus = stat()
        guard Darwin.lstat(real, &sealedStatus) == 0, (sealedStatus.st_mode & 0o7777) == 0 else {
            throw BrokerFailure(code: "MOUNTPOINT_RESEAL_FAILED", message: "mountpoint was not sealed after inspection")
        }
        return real
    } catch {
        if descriptor >= 0 {
            do {
                try setDescriptorMode(descriptor, mode: 0, expected: identity, failureCode: "MOUNTPOINT_RESEAL_FAILED")
            } catch let resealFailure as BrokerFailure {
                Darwin.close(descriptor)
                throw resealFailure
            }
            Darwin.close(descriptor)
            descriptor = -1
        }
        do {
            try setMountPointMode(real, mode: 0, expected: identity, failureCode: "MOUNTPOINT_RESEAL_FAILED")
        } catch let resealFailure as BrokerFailure {
            throw resealFailure
        }
        throw error
    }
}

private func deviceNumber(_ value: String) throws -> UInt64 {
    var status = stat()
    let result = value.withCString { pointer in
        Darwin.lstat(pointer, &status)
    }
    guard result == 0 else {
        throw BrokerFailure(code: "STAT_FAILED", message: "unable to inspect mount device identity")
    }
    return UInt64(status.st_dev)
}

private func validateMountedVolume(
    mountPoint: String,
    expectedVolumeUUID: String?
) throws -> MountedVolume {
    let exactMount = try existingRealPath(mountPoint, field: "mounted volume")
    let info = try diskutilInfo(exactMount)
    guard stringValue(info, ["MountPoint"]) == exactMount else {
        throw BrokerFailure(code: "MOUNT_IDENTITY_MISMATCH", message: "volume is not mounted at the exact requested path")
    }
    guard stringValue(info, ["FilesystemType", "TypeBundle"])?.lowercased() == "apfs" else {
        throw BrokerFailure(code: "MOUNT_FILESYSTEM_MISMATCH", message: "mounted volume is not APFS")
    }
    guard boolValue(info, ["Writable", "WritableVolume"]),
          !boolValue(info, ["ReadOnly", "ReadOnlyVolume"]) else {
        throw BrokerFailure(code: "MOUNT_READ_ONLY", message: "mounted APFS volume is not writable")
    }
    guard boolValue(info, ["GlobalPermissionsEnabled", "Owners", "OwnershipEnabled"]) else {
        throw BrokerFailure(code: "MOUNT_OWNERSHIP_DISABLED", message: "mounted APFS volume does not enforce ownership")
    }
    let actualUUID = try normalizedUUID(stringValue(info, ["VolumeUUID"]) ?? "", field: "APFS VolumeUUID")
    if let expectedVolumeUUID {
        let expected = try normalizedUUID(expectedVolumeUUID, field: "expected-volume-uuid")
        guard actualUUID == expected else {
            throw BrokerFailure(code: "VOLUME_UUID_MISMATCH", message: "APFS UUID does not match the required pin")
        }
    }
    guard let device = stringValue(info, ["DeviceIdentifier"]),
          let wholeDisk = stringValue(info, ["ParentWholeDisk"]) else {
        throw BrokerFailure(code: "MOUNT_DEVICE_MISSING", message: "mounted APFS device identifiers are incomplete")
    }
    guard try deviceNumber(exactMount) != deviceNumber(URL(fileURLWithPath: exactMount).deletingLastPathComponent().path) else {
        throw BrokerFailure(code: "BARE_LOCAL_FALLBACK", message: "mountpoint is still on its parent filesystem")
    }
    return MountedVolume(
        mountPoint: exactMount,
        deviceIdentifier: device,
        wholeDiskIdentifier: wholeDisk,
        volumeUUID: actualUUID
    )
}

private func validateImageDeviceMapping(imagePath: String, mounted: MountedVolume) throws {
    let result = try requireSuccess(
        runProcess("/usr/bin/hdiutil", ["info", "-plist"]),
        code: "HDIUTIL_INFO_FAILED",
        operation: "hdiutil image mapping inspection"
    )
    let root = try propertyList(result.stdout, operation: "hdiutil info")
    let images = root["images"] as? [[String: Any]] ?? []
    let expectedDevice = "/dev/\(mounted.deviceIdentifier)"
    let matched = images.contains { image in
        guard let reportedPath = stringValue(image, ["image-path", "imagePath"]),
              URL(fileURLWithPath: reportedPath).standardizedFileURL.path == imagePath else {
            return false
        }
        let entities = image["system-entities"] as? [[String: Any]] ?? []
        return entities.contains { entity in
            stringValue(entity, ["dev-entry", "device-entry"]) == expectedDevice
                && stringValue(entity, ["mount-point", "mountPoint"]) == mounted.mountPoint
        }
    }
    guard matched else {
        throw BrokerFailure(code: "IMAGE_DEVICE_MAPPING_MISMATCH", message: "mounted APFS device is not derived from the exact enrolled sparsebundle")
    }
}

private func wholeDiskFromAttachPlist(_ data: Data, mountPoint: String) throws -> String {
    let root = try propertyList(data, operation: "hdiutil attach")
    let entities = root["system-entities"] as? [[String: Any]] ?? []
    guard let mountedEntity = entities.first(where: {
        stringValue($0, ["mount-point", "mountPoint"]) == mountPoint
    }), let deviceEntry = stringValue(mountedEntity, ["dev-entry", "device-entry"]) else {
        throw BrokerFailure(code: "ATTACH_EVIDENCE_MISSING", message: "hdiutil attach did not identify the requested mountpoint")
    }
    let identifier = deviceEntry.hasPrefix("/dev/") ? String(deviceEntry.dropFirst(5)) : deviceEntry
    guard identifier.hasPrefix("disk") else {
        throw BrokerFailure(code: "ATTACH_EVIDENCE_MISSING", message: "hdiutil attach returned an invalid device identifier")
    }
    let digits = identifier.dropFirst(4).prefix(while: { $0.isNumber })
    guard !digits.isEmpty else {
        throw BrokerFailure(code: "ATTACH_EVIDENCE_MISSING", message: "hdiutil attach returned an invalid whole-disk mapping")
    }
    return "disk\(digits)"
}

private func attachImage(
    imagePath: String,
    mountPoint: String,
    expectedVolumeUUID: String?
) throws -> MountedVolume {
    let preparedMount = try prepareEmptyMountPoint(mountPoint)
    let attachResult = try runHdiutilWithSecret([
        "attach",
        "-readwrite",
        "-owners", "on",
        "-nobrowse",
        "-noautoopen",
        "-mountpoint", preparedMount,
        "-stdinpass",
        "-plist",
        imagePath,
    ], operation: "encrypted image attach")
    let attachedWholeDisk: String
    do {
        attachedWholeDisk = try wholeDiskFromAttachPlist(attachResult.stdout, mountPoint: preparedMount)
    } catch {
        throw BrokerFailure(
            code: "ATTACH_CLEANUP_FAILED",
            message: "attach completed without enough image-pinned evidence for safe cleanup"
        )
    }
    do {
        let mounted = try validateMountedVolume(mountPoint: preparedMount, expectedVolumeUUID: expectedVolumeUUID)
        guard mounted.wholeDiskIdentifier == attachedWholeDisk else {
            throw BrokerFailure(code: "IMAGE_DEVICE_MAPPING_MISMATCH", message: "attach plist and diskutil whole-disk identities disagree")
        }
        try validateImageDeviceMapping(imagePath: imagePath, mounted: mounted)
        return mounted
    } catch {
        guard let detach = try? runProcess("/usr/bin/hdiutil", ["detach", "/dev/\(attachedWholeDisk)"]),
              detach.status == 0 else {
            throw BrokerFailure(
                code: "ATTACH_CLEANUP_FAILED",
                message: "attach validation failed and the mounted image could not be detached safely"
            )
        }
        do {
            try sealBareMountPoint(preparedMount)
        } catch {
            throw BrokerFailure(
                code: "ATTACH_CLEANUP_FAILED",
                message: "attach validation failed and the detached mountpoint could not be resealed"
            )
        }
        throw error
    }
}

private func detachMountedVolume(_ mounted: MountedVolume) throws {
    _ = try requireSuccess(runProcess("/bin/sync", []), code: "SYNC_FAILED", operation: "filesystem sync")
    _ = try requireSuccess(
        runProcess("/usr/bin/hdiutil", ["detach", "/dev/\(mounted.wholeDiskIdentifier)"]),
        code: "DETACH_FAILED",
        operation: "encrypted image detach"
    )
    try sealBareMountPoint(mounted.mountPoint)
}

private func verifyEncrypted(_ imagePath: String) throws {
    let result = try requireSuccess(
        runProcess("/usr/bin/hdiutil", ["isencrypted", "-plist", imagePath]),
        code: "ENCRYPTION_VERIFY_FAILED",
        operation: "encrypted image verification"
    )
    let value: Any
    do {
        value = try PropertyListSerialization.propertyList(from: result.stdout, options: [], format: nil)
    } catch {
        throw BrokerFailure(code: "ENCRYPTION_VERIFY_FAILED", message: "hdiutil returned invalid encryption evidence")
    }
    guard let evidence = value as? [String: Any], evidence["encrypted"] as? Bool == true else {
        throw BrokerFailure(code: "ENCRYPTION_VERIFY_FAILED", message: "image is not reported as encrypted")
    }
}

private func createImage(_ parsed: ParsedArguments) throws -> [String: Any] {
    try requireOptions(parsed, ["--image", "--volume-name", "--size", "--expected-host-uuid"])
    guard parsed.options["--volume-name"] == volumeName,
          parsed.options["--size"]?.lowercased() == virtualSize else {
        throw BrokerFailure(code: "CREATE_POLICY_MISMATCH", message: "only the fixed 256 GiB Phase-1 image policy is accepted")
    }
    let hostUUID = try validateHost(expectedUUID: parsed.options["--expected-host-uuid"]!)
    let imagePath = try validateImagePath(parsed.options["--image"]!, mustExist: false)
    var mounted: MountedVolume?
    let temporaryRoot = "/private/tmp/yuri-backend-broker-enroll-\(UUID().uuidString.lowercased())"
    let temporaryMount = "\(temporaryRoot)/mount"

    do {
        _ = try runHdiutilWithSecret([
            "create",
            "-size", virtualSize,
            "-type", "SPARSEBUNDLE",
            "-layout", "GPTSPUD",
            "-fs", "APFS",
            "-volname", volumeName,
            "-encryption", "AES-256",
            "-stdinpass",
            "-nospotlight",
            "-plist",
            imagePath,
        ], operation: "AES-256 image creation")

        try FileManager.default.createDirectory(
            atPath: temporaryMount,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: NSNumber(value: 0o700)]
        )
        mounted = try attachImage(imagePath: imagePath, mountPoint: temporaryMount, expectedVolumeUUID: nil)
        try detachMountedVolume(mounted!)
        let volumeUUID = mounted!.volumeUUID
        mounted = nil
        try FileManager.default.setAttributes([.posixPermissions: NSNumber(value: 0o700)], ofItemAtPath: temporaryMount)
        try FileManager.default.removeItem(atPath: temporaryRoot)
        try verifyEncrypted(imagePath)

        return [
            "ok": true,
            "purpose": purpose,
            "imagePath": imagePath,
            "volumeUUID": volumeUUID,
            "hostVolumeUUID": hostUUID,
            "encryption": "AES-256",
            "virtualSizeGiB": 256,
            "detached": true,
        ]
    } catch {
        if let failure = error as? BrokerFailure, failure.code == "ATTACH_CLEANUP_FAILED" {
            throw failure
        }
        if let mounted {
            if (try? detachMountedVolume(mounted)) == nil {
                throw BrokerFailure(code: "CREATE_CLEANUP_FAILED", message: "image creation failed and the enrollment mount could not be detached safely")
            }
        }
        if FileManager.default.fileExists(atPath: temporaryRoot) {
            try? FileManager.default.setAttributes([.posixPermissions: NSNumber(value: 0o700)], ofItemAtPath: temporaryMount)
            try? FileManager.default.removeItem(atPath: temporaryRoot)
        }
        throw error
    }
}

private func attachCommand(_ parsed: ParsedArguments) throws -> [String: Any] {
    try requireOptions(parsed, ["--image", "--mountpoint", "--expected-volume-uuid", "--expected-host-uuid"])
    let hostUUID = try validateHost(expectedUUID: parsed.options["--expected-host-uuid"]!)
    let imagePath = try validateImagePath(parsed.options["--image"]!, mustExist: true)
    let expectedVolumeUUID = try normalizedUUID(parsed.options["--expected-volume-uuid"]!, field: "expected-volume-uuid")
    let mounted = try attachImage(
        imagePath: imagePath,
        mountPoint: parsed.options["--mountpoint"]!,
        expectedVolumeUUID: expectedVolumeUUID
    )
    return [
        "ok": true,
        "purpose": purpose,
        "imagePath": imagePath,
        "mountPoint": mounted.mountPoint,
        "deviceIdentifier": mounted.deviceIdentifier,
        "volumeUUID": mounted.volumeUUID,
        "hostVolumeUUID": hostUUID,
    ]
}

private func detachCommand(_ parsed: ParsedArguments) throws -> [String: Any] {
    try requireOptions(parsed, ["--mountpoint", "--expected-volume-uuid", "--expected-host-uuid"])
    let mountPoint = try allowedMountPoint(parsed.options["--mountpoint"]!)
    let expectedVolumeUUID = try normalizedUUID(parsed.options["--expected-volume-uuid"]!, field: "expected-volume-uuid")
    let hostUUID = try validateHost(expectedUUID: parsed.options["--expected-host-uuid"]!)
    let mounted = try validateMountedVolume(mountPoint: mountPoint, expectedVolumeUUID: expectedVolumeUUID)
    _ = try validateImagePath(canonicalImagePath, mustExist: true)
    try validateImageDeviceMapping(imagePath: canonicalImagePath, mounted: mounted)
    try detachMountedVolume(mounted)
    return [
        "ok": true,
        "mountPoint": mountPoint,
        "deviceIdentifier": mounted.deviceIdentifier,
        "volumeUUID": mounted.volumeUUID,
        "hostVolumeUUID": hostUUID,
    ]
}

private func usage() -> String {
    return """
    Usage:
      backend-volume-broker provision --json
      backend-volume-broker key-status --json
      backend-volume-broker create-image --image \(canonicalImagePath) --volume-name "\(volumeName)" --size 256g --expected-host-uuid <uuid> --json
      backend-volume-broker attach --image \(canonicalImagePath) --mountpoint <path> --expected-volume-uuid <uuid> --expected-host-uuid <uuid> --json
      backend-volume-broker detach --mountpoint <path> --expected-volume-uuid <uuid> --expected-host-uuid <uuid> --json
    """
}

private func dispatch(_ parsed: ParsedArguments) throws -> [String: Any]? {
    switch parsed.command {
    case "help":
        FileHandle.standardOutput.write(Data(usage().utf8))
        return nil
    case "provision":
        try requireOptions(parsed, [])
        return try provisionKey()
    case "key-status":
        try requireOptions(parsed, [])
        return [
            "ok": true,
            "present": try keyStatus(),
            "service": keychainService,
            "account": keychainAccount,
        ]
    case "create-image":
        return try createImage(parsed)
    case "attach":
        return try attachCommand(parsed)
    case "detach":
        return try detachCommand(parsed)
    default:
        throw BrokerFailure(code: "CLI_USAGE", message: "unknown broker command")
    }
}

#if BACKEND_VOLUME_BROKER_MOUNTPOINT_TEST
do {
    guard CommandLine.arguments.count == 2 else {
        throw BrokerFailure(code: "CLI_USAGE", message: "fixture build requires one mountpoint")
    }
    let mountPoint = try prepareEmptyMountPoint(CommandLine.arguments[1])
    try outputJSON(["ok": true, "mountPoint": mountPoint])
} catch let error as BrokerFailure {
    try? outputJSON(["ok": false, "code": error.code, "error": error.message], to: .standardError)
    Darwin.exit(EXIT_FAILURE)
} catch {
    try? outputJSON(["ok": false, "code": "BROKER_FAILED", "error": "unexpected broker failure"], to: .standardError)
    Darwin.exit(EXIT_FAILURE)
}
#else
do {
    let parsed = try parseArguments(Array(CommandLine.arguments.dropFirst()))
    if let payload = try dispatch(parsed) {
        try outputJSON(payload)
    }
} catch let error as BrokerFailure {
    try? outputJSON([
        "ok": false,
        "code": error.code,
        "error": error.message,
    ], to: .standardError)
    Darwin.exit(EXIT_FAILURE)
} catch {
    try? outputJSON([
        "ok": false,
        "code": "BROKER_FAILED",
        "error": "unexpected broker failure",
    ], to: .standardError)
    Darwin.exit(EXIT_FAILURE)
}
#endif
