-- YURI VoxKey adapter: exclusive Ctrl+Space PTT, exact-field safety, and a bottom Flow Bar.
-- The pinned upstream VoxKey CLI remains the ASR engine. This module owns UI and activation policy.

local M = {}
local home = os.getenv("HOME") or ""
local repoRoot = home .. "/YURI-OS-MUSUBI"
local command = home .. "/.local/bin/voxkey"
local dataRoot = home .. "/.local/share/voxkey"
local runtimePython = dataRoot .. "/venv/bin/python"
local modulePath = home .. "/.hammerspoon/yuri-voxkey.lua"
local initPath = home .. "/.hammerspoon/init.lua"
local receiptPath = home .. "/.local/state/yuri/voxkey-install.json"
local backupRoot = home .. "/.local/state/yuri/voxkey-backups"
local upstreamCommit = "f4416ebdf00c1ca4d1b1840103f936d965a66b2f"
local upstreamTree = "b0c65684b44deddcee148fc8c79f7c307e62ccc4"
local upstreamNodeLockSha256 = "eae991245ac5deb4b47bb21506d2f1cf4095c3d410f585e14254535ae6807e08"
local expectedRuntimeBindingSha256 = "ebdb837d3d3ebcb524cf8f72b69ffac5dc3c9c785de3c4071a26260d1ed1b143"
local sessionLauncher = "import os,sys; os.setsid(); os.execv(sys.argv[1], sys.argv[1:])"
local stateDir = repoRoot .. "/_SYSTEM/state/voice"
local pttHeld = stateDir .. "/ptt-held.flag"
local ownerLock = stateDir .. "/ptt-owner.lock"
local ownerFile = ownerLock .. "/owner.pid"
local ownerPid = tostring(hs.processInfo.processID)
local modifiers = { "ctrl" }
local key = "space"
local maxRecordingSeconds = 120
local transcriptionTimeoutSeconds = 30
local terminationGraceSeconds = 0.75
local terminationPollSeconds = 0.10
local activeRun = nil
local runId = 0
local hotkey = nil
local escapeHotkey = nil
local heartbeat = nil
local watchdog = nil
local stateWatcher = nil
local voiceLock = nil
local cancelRun = nil
local finishRun = nil
local focusedElement = nil
local sameTarget = nil
local previousShutdownCallback = hs.shutdownCallback

local competingListeners = {
  "_SYSTEM/Scripts/voice/voice-ptt.py",
  "_SYSTEM/Scripts/voice/parakeet-listen.py",
  "_SYSTEM/Scripts/voice/voice-listen.sh",
  "_SYSTEM/Scripts/voice/bot.py",
  "_SYSTEM/Scripts/voice/yuri-interrupt-listener.py",
}

local colors = {
  background = { red = 0.055, green = 0.063, blue = 0.082, alpha = 0.96 },
  border = { red = 0.22, green = 0.25, blue = 0.33, alpha = 0.85 },
  text = { white = 0.96, alpha = 1.0 },
  muted = { white = 0.64, alpha = 1.0 },
  ready = { red = 0.32, green = 0.78, blue = 0.98, alpha = 1.0 },
  recording = { red = 0.98, green = 0.31, blue = 0.43, alpha = 1.0 },
  transcribing = { red = 0.67, green = 0.48, blue = 1.0, alpha = 1.0 },
  success = { red = 0.35, green = 0.86, blue = 0.56, alpha = 1.0 },
  cancelled = { red = 0.96, green = 0.66, blue = 0.28, alpha = 1.0 },
  error = { red = 1.0, green = 0.38, blue = 0.34, alpha = 1.0 },
}

local flow = {
  canvas = nil,
  timer = nil,
  hideTimer = nil,
  phase = 0,
  state = "ready",
  width = 330,
  height = 58,
  barCount = 12,
}

local function trim(value)
  return (value or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function truncate(value, maximum)
  local clean = trim(value):gsub("[%c]+", " ")
  if #clean <= maximum then return clean end
  return clean:sub(1, maximum - 1) .. "…"
end

local function stopTimer(timer)
  if timer then timer:stop() end
end

local function flowFrame(run)
  local screen = nil
  if run and run.targetApp and run.targetApp:isRunning() then
    local window = run.targetApp:mainWindow()
    if window then screen = window:screen() end
  end
  screen = screen or hs.mouse.getCurrentScreen() or hs.screen.mainScreen()
  local frame = screen:frame()
  return {
    x = frame.x + (frame.w - flow.width) / 2,
    y = frame.y + frame.h - flow.height - 44,
    w = flow.width,
    h = flow.height,
  }
end

local function ensureFlow(run)
  local frame = flowFrame(run)
  if not flow.canvas then
    flow.canvas = hs.canvas.new(frame)
    flow.canvas:level(hs.canvas.windowLevels.overlay)
    flow.canvas:behavior({ "canJoinAllSpaces", "stationary", "transient", "ignoresCycle" })
    flow.canvas:clickActivating(false)
  else
    flow.canvas:frame(frame)
  end

  flow.canvas[1] = {
    type = "rectangle", action = "fill", fillColor = colors.background,
    roundedRectRadii = { xRadius = 18, yRadius = 18 },
    frame = { x = 0, y = 0, w = flow.width, h = flow.height },
    strokeColor = colors.border, strokeWidth = 1,
  }
  flow.canvas[2] = {
    type = "oval", action = "fill", fillColor = colors.ready,
    frame = { x = 18, y = 19, w = 20, h = 20 },
  }
  flow.canvas[3] = {
    type = "text", text = "Ready", textColor = colors.text, textSize = 14,
    textAlignment = "left", frame = { x = 50, y = 11, w = 130, h = 22 },
  }
  flow.canvas[4] = {
    type = "text", text = "Ctrl+Space", textColor = colors.muted, textSize = 10,
    textAlignment = "left", frame = { x = 50, y = 31, w = 130, h = 16 },
  }
  for index = 1, flow.barCount do
    flow.canvas[4 + index] = {
      type = "rectangle", action = "fill", fillColor = colors.ready,
      roundedRectRadii = { xRadius = 2, yRadius = 2 },
      frame = { x = 183 + ((index - 1) * 10), y = 25, w = 5, h = 8 },
    }
  end
  return flow.canvas
end

local function updateBars()
  if not flow.canvas then return end
  flow.phase = flow.phase + 1
  local tint = colors[flow.state] or colors.ready
  for index = 1, flow.barCount do
    local height
    if flow.state == "recording" then
      height = 7 + ((index * 7 + flow.phase * 5) % 22)
    elseif flow.state == "transcribing" then
      local distance = math.abs(((flow.phase % (flow.barCount * 2)) - flow.barCount) - index)
      height = math.max(5, 24 - distance * 3)
    else
      height = 7 + ((index + flow.phase) % 3) * 2
    end
    flow.canvas[4 + index].fillColor = tint
    flow.canvas[4 + index].frame = { x = 183 + ((index - 1) * 10), y = (flow.height - height) / 2, w = 5, h = height }
  end
end

local function showFlow(state, message, run, hideAfter)
  stopTimer(flow.hideTimer)
  flow.hideTimer = nil
  local canvas = ensureFlow(run)
  flow.state = state
  canvas[2].fillColor = colors[state] or colors.ready
  canvas[3].text = truncate(message, 25)
  canvas[4].text = state == "recording" and "Release to transcribe · Esc cancels"
    or (state == "transcribing" and "Local Parakeet" or "Ctrl+Space")
  canvas:show()
  stopTimer(flow.timer)
  flow.timer = nil
  if state == "recording" or state == "transcribing" then
    flow.timer = hs.timer.doEvery(0.11, updateBars)
  else
    updateBars()
  end
  if hideAfter then
    flow.hideTimer = hs.timer.doAfter(hideAfter, function()
      if flow.canvas then flow.canvas:hide() end
    end)
  end
end

local function ensureStateDirectory()
  local stateRoot = repoRoot .. "/_SYSTEM/state"
  if not hs.fs.attributes(stateRoot) then hs.fs.mkdir(stateRoot) end
  if not hs.fs.attributes(stateDir) then hs.fs.mkdir(stateDir) end
  return hs.fs.attributes(stateDir) ~= nil
end

local function readSmallFile(file)
  local handle = io.open(file, "r")
  if not handle then return nil end
  local value = trim(handle:read("*a"))
  handle:close()
  return value
end

local function writeSmallFile(file, value)
  local handle = io.open(file, "w")
  if not handle then return false end
  handle:write(value)
  handle:flush()
  handle:close()
  return true
end

local function readBoundedRegularFile(file, maximumBytes)
  local attributes = hs.fs.symlinkAttributes(file)
  if not attributes or attributes.mode ~= "file" or tonumber(attributes.size or -1) < 0
    or tonumber(attributes.size or -1) > maximumBytes then return nil end
  local handle = io.open(file, "rb")
  if not handle then return nil end
  local body = handle:read("*a")
  handle:close()
  if type(body) ~= "string" or #body > maximumBytes then return nil end
  return body
end

local function sha256(value)
  if not hs.hash or type(hs.hash.SHA256) ~= "function" then return nil end
  local ok, digest = pcall(hs.hash.SHA256, value)
  if not ok or type(digest) ~= "string" then return nil end
  return digest:lower()
end

local function validSha256(value)
  return type(value) == "string" and value:match("^[a-f0-9]+$") ~= nil and #value == 64
end

local function validTransactionId(value)
  local uuid = type(value) == "string" and value:match("^voxkey%-(.+)$") or nil
  if not uuid then return false end
  local first, second, third, fourth, fifth = uuid:match("^([a-f0-9]+)%-([a-f0-9]+)%-([a-f0-9]+)%-([a-f0-9]+)%-([a-f0-9]+)$")
  return first ~= nil and #first == 8 and #second == 4 and #third == 4 and #fourth == 4 and #fifth == 12
end

local function loadInstallReceipt()
  local body = readBoundedRegularFile(receiptPath, 65536)
  if not body or not hs.json or type(hs.json.decode) ~= "function" then return nil end
  local ok, receipt = pcall(hs.json.decode, body)
  if not ok or type(receipt) ~= "table" then return nil end
  local transactionId = tostring(receipt.transactionId or "")
  local privacy = receipt.privacy
  local fingerprint = receipt.runtimeFingerprint
  if receipt.schemaVersion ~= 2
    or not validTransactionId(transactionId)
    or type(receipt.upstream) ~= "table"
    or receipt.upstream.commit ~= upstreamCommit
    or receipt.upstream.tree ~= upstreamTree
    or receipt.command ~= command
    or receipt.dataRoot ~= dataRoot
    or receipt.module ~= modulePath
    or receipt.init ~= initPath
    or receipt.backupDir ~= (backupRoot .. "/" .. transactionId)
    or receipt.runtimeCreated ~= true
    or receipt.requireAdded ~= true
    or receipt.runtimeBindingSha256 ~= expectedRuntimeBindingSha256
    or receipt.activation ~= "pending-hammerspoon-reload-tcc-and-assignability-proof"
    or type(privacy) ~= "table"
    or privacy.formatter ~= "disabled"
    or privacy.autoSubmit ~= false
    or privacy.history ~= "disabled"
    or privacy.contextCapture ~= "disabled"
    or not validSha256(receipt.moduleSha256)
    or not validSha256(receipt.initAfterSha256)
    or not validSha256(receipt.managedAppendSha256)
    or type(fingerprint) ~= "table"
    or type(fingerprint.commandLinkTarget) ~= "string"
    or fingerprint.commandLinkTarget:sub(1, #dataRoot + 1) ~= (dataRoot .. "/")
    or not validSha256(fingerprint.commandTargetSha256)
    or not validSha256(fingerprint.nodeLockSha256)
    or not validSha256(fingerprint.markerSha256) then return nil end
  local commandAttributes = hs.fs.symlinkAttributes(command)
  local dataAttributes = hs.fs.symlinkAttributes(dataRoot)
  if not commandAttributes or commandAttributes.mode ~= "link"
    or commandAttributes.target ~= fingerprint.commandLinkTarget
    or not dataAttributes or dataAttributes.mode ~= "directory" then return nil end
  local moduleBody = readBoundedRegularFile(modulePath, 524288)
  local initBody = readBoundedRegularFile(initPath, 524288)
  local commandBody = readBoundedRegularFile(fingerprint.commandLinkTarget, 8388608)
  local nodeLockBody = readBoundedRegularFile(dataRoot .. "/node/package-lock.json", 2097152)
  local markerBody = readBoundedRegularFile(dataRoot .. "/.yuri-voxkey-owner.json", 65536)
  local markerOk, marker = false, nil
  if markerBody then markerOk, marker = pcall(hs.json.decode, markerBody) end
  local _, managedRequireCount = (initBody or ""):gsub('require%("yuri%-voxkey"%)%s*%-%-%s*YURI:voxkey%-managed%-v1', "")
  if not moduleBody or sha256(moduleBody) ~= receipt.moduleSha256
    or not initBody or managedRequireCount ~= 1
    or not commandBody or sha256(commandBody) ~= fingerprint.commandTargetSha256
    or not nodeLockBody or sha256(nodeLockBody) ~= upstreamNodeLockSha256
    or fingerprint.nodeLockSha256 ~= upstreamNodeLockSha256
    or not markerBody or sha256(markerBody) ~= fingerprint.markerSha256
    or not markerOk or type(marker) ~= "table"
    or marker.schemaVersion ~= 1
    or marker.transactionId ~= transactionId
    or type(marker.upstream) ~= "table"
    or marker.upstream.commit ~= upstreamCommit
    or marker.upstream.tree ~= upstreamTree
    or marker.commandLinkTarget ~= fingerprint.commandLinkTarget
    or marker.commandTargetSha256 ~= fingerprint.commandTargetSha256
    or marker.nodeLockSha256 ~= fingerprint.nodeLockSha256 then return nil end
  return receipt
end

local function pidAlive(pid)
  if not tostring(pid or ""):match("^%d+$") then return false end
  local ok = os.execute("/bin/kill -0 " .. tostring(pid) .. " >/dev/null 2>&1")
  return ok == true or ok == 0
end

local function releaseOwnership()
  if readSmallFile(pttHeld) == ownerPid then os.remove(pttHeld) end
  if readSmallFile(ownerFile) == ownerPid then os.remove(ownerFile) end
  if voiceLock then voiceLock:free(); voiceLock = nil end
end

local function acquireOwnership()
  if not ensureStateDirectory() then return false end
  if not hs.fs.attributes(ownerLock) then hs.fs.mkdir(ownerLock) end
  if not hs.fs.attributes(ownerLock) then return false end
  local lock = hs.fs.lockDir(ownerLock, maxRecordingSeconds + 15)
  if not lock then return false end
  voiceLock = lock
  local heldOwner = readSmallFile(pttHeld)
  if heldOwner and heldOwner ~= ownerPid and pidAlive(heldOwner) then
    voiceLock:free()
    voiceLock = nil
    return false
  end
  if heldOwner and heldOwner ~= ownerPid then os.remove(pttHeld) end
  if not writeSmallFile(ownerFile, ownerPid) or not writeSmallFile(pttHeld, ownerPid) then
    if readSmallFile(pttHeld) == ownerPid then os.remove(pttHeld) end
    os.remove(ownerFile)
    voiceLock:free()
    voiceLock = nil
    return false
  end
  return true
end

local function refreshOwnership()
  if readSmallFile(ownerFile) ~= ownerPid then return false end
  local heldOwner = readSmallFile(pttHeld)
  if heldOwner and heldOwner ~= ownerPid then return false end
  return writeSmallFile(ownerFile, ownerPid) and writeSmallFile(pttHeld, ownerPid)
end

local function secureInputEnabled()
  return hs.eventtap.isSecureInputEnabled and hs.eventtap.isSecureInputEnabled() == true
end

local function startHeartbeat(run)
  stopTimer(heartbeat)
  stopTimer(watchdog)
  heartbeat = hs.timer.doEvery(0.5, function()
    if activeRun ~= run or not run.recording then return end
    local frontmost = hs.application.frontmostApplication()
    local current = focusedElement and focusedElement() or nil
    if secureInputEnabled() then cancelRun("Secure Input enabled; recording cancelled")
    elseif not frontmost or frontmost:pid() ~= run.targetPid or not current or not sameTarget(run, current) then
      cancelRun("Focus changed; recording cancelled")
    elseif not refreshOwnership() then
      cancelRun("Voice ownership was lost; recording cancelled")
    end
  end)
  watchdog = hs.timer.doAfter(maxRecordingSeconds, function()
    if activeRun == run and run.recording then cancelRun("Recording limit reached; cancelled") end
  end)
end

local function stopHeartbeat()
  stopTimer(heartbeat)
  stopTimer(watchdog)
  heartbeat = nil
  watchdog = nil
end

local function shellWords(commandLine)
  local words, word, quote, escaped = {}, "", nil, false
  for index = 1, #commandLine do
    local character = commandLine:sub(index, index)
    if escaped then word = word .. character; escaped = false
    elseif character == "\\" and quote ~= "'" then escaped = true
    elseif quote then
      if character == quote then quote = nil else word = word .. character end
    elseif character == '"' or character == "'" then quote = character
    elseif character:match("%s") then
      if word ~= "" then table.insert(words, word); word = "" end
    else word = word .. character end
  end
  if word ~= "" then table.insert(words, word) end
  return words
end

local function basename(value)
  return tostring(value or ""):match("([^/]+)$") or tostring(value or "")
end

local interpreters = {
  python = true, python3 = true, ["python3.10"] = true,
  node = true, bun = true, bash = true, sh = true, zsh = true, dash = true,
  ruby = true, perl = true, osascript = true,
}

local shellInterpreters = { bash = true, sh = true, zsh = true, dash = true }

local function envCommandIndex(words)
  local index = 2
  while words[index] do
    local option = words[index]
    if option == "--" then return index + 1 end
    if option:match("^[%a_][%w_]*=") then index = index + 1
    elseif option == "-u" or option == "--unset" or option == "-C" or option == "--chdir"
      or option == "-S" or option == "--split-string" then
      if not words[index + 1] then return #words + 1 end
      index = index + 2
    elseif option:match("^%-%-unset=") or option:match("^%-%-chdir=")
      or option:match("^%-%-split%-string=") or option:match("^%-u.+") or option:match("^%-C.+") then
      index = index + 1
    elseif option:sub(1, 1) == "-" then index = index + 1
    else return index end
  end
  return index
end

local function isInlineShellOption(option)
  if option == "-c" then return true end
  if option:sub(1, 2) ~= "--" and option:sub(1, 1) == "-" then
    return option:sub(2):match("c") ~= nil
  end
  return false
end

local function processIdentity(commandLine)
  local words = shellWords(commandLine)
  local index = 1
  if basename(words[index]) == "env" then
    index = envCommandIndex(words)
  end
  local executable = words[index] or ""
  local script = executable
  local executableName = basename(executable):lower()
  if interpreters[executableName] or executableName:match("^python%d+[.]?%d*$") then
    index = index + 1
    while words[index] and (words[index]:sub(1, 1) == "-"
      or (shellInterpreters[executableName] and words[index]:sub(1, 1) == "+")) do
      local option = words[index]
      if option == "--" then index = index + 1; break end
      if option == "-m" and words[index + 1] then return executable, "module:" .. words[index + 1] end
      if option == "-c" or option == "-e" or option == "--eval" or option == "--print"
        or (shellInterpreters[executableName] and isInlineShellOption(option)) then return executable, "inline-code" end
      local consumesOperand = false
      if executableName:match("^python") then
        consumesOperand = option == "-W" or option == "-X" or option == "--check-hash-based-pycs"
      elseif shellInterpreters[executableName] then
        consumesOperand = option == "-o" or option == "+o" or option == "-O" or option == "+O"
          or option == "--rcfile" or option == "--init-file"
      else
        consumesOperand = option == "-r" or option == "--require" or option == "--loader" or option == "--import"
      end
      if consumesOperand and not words[index + 1] then index = #words + 1; break end
      index = index + (consumesOperand and 2 or 1)
    end
    script = words[index] or ""
  end
  return executable, script
end

local function endsWith(value, suffix)
  return suffix == "" or value:sub(-#suffix) == suffix
end

local function matchedVoiceIdentity(commandLine)
  local executable, script = processIdentity(commandLine)
  if basename(executable):lower() == "voxkey" or basename(script):lower() == "voxkey" or script == "module:voxkey" then
    return "voxkey-cli"
  end
  for _, pattern in ipairs(competingListeners) do
    if script == pattern or endsWith(script, "/" .. pattern) or executable == pattern or endsWith(executable, "/" .. pattern) then
      return pattern
    end
  end
  return nil
end

local function activeConflicts()
  local output, ok = hs.execute("/bin/ps -ax -o command=", true)
  if ok ~= true or type(output) ~= "string" then return nil, "process-table-unavailable" end
  local found = {}
  for commandLine in output:gmatch("[^\n]+") do
    local identity = matchedVoiceIdentity(trim(commandLine))
    if identity then table.insert(found, identity) end
  end
  return found, nil
end

local function attribute(element, name)
  if not element then return nil end
  local ok, value = pcall(function() return element:attributeValue(name) end)
  return ok and value or nil
end

focusedElement = function()
  local system = hs.axuielement.systemWideElement()
  return attribute(system, "AXFocusedUIElement")
end

local function isSecureElement(element)
  local role = tostring(attribute(element, "AXRole") or "")
  local subrole = tostring(attribute(element, "AXSubrole") or "")
  local protected = attribute(element, "AXProtectedContent")
  return protected == true or role == "AXSecureTextField" or subrole == "AXSecureTextField"
end

local editableRoles = {
  AXTextField = true,
  AXTextArea = true,
  AXSearchField = true,
  AXComboBox = true,
}

local function captureTarget()
  if secureInputEnabled() then return nil, "Secure Input is enabled" end
  local app = hs.application.frontmostApplication()
  local element = focusedElement()
  if not app or not element then return nil, "Focus a text field first" end
  if isSecureElement(element) then return nil, "Secure fields never accept dictation" end
  local role = tostring(attribute(element, "AXRole") or "")
  if not editableRoles[role] then return nil, "Focused control is not an editable text field" end
  return {
    app = app,
    appPid = app:pid(),
    element = element,
    role = role,
    subrole = tostring(attribute(element, "AXSubrole") or ""),
    identifier = tostring(attribute(element, "AXIdentifier") or ""),
    window = attribute(element, "AXWindow"),
  }
end

sameTarget = function(run, current)
  if current == run.targetElement then return true end
  local identifier = tostring(attribute(current, "AXIdentifier") or "")
  local role = tostring(attribute(current, "AXRole") or "")
  local subrole = tostring(attribute(current, "AXSubrole") or "")
  local window = attribute(current, "AXWindow")
  return run.targetIdentifier ~= ""
    and identifier == run.targetIdentifier
    and role == run.targetRole
    and subrole == run.targetSubrole
    and run.targetWindow ~= nil
    and window == run.targetWindow
end

local function taskEnvironment()
  return {
    HOME = home,
    PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    LANG = os.getenv("LANG") or "en_US.UTF-8",
    TMPDIR = os.getenv("TMPDIR") or "/tmp",
    XDG_DATA_HOME = home .. "/.local/share",
    VOXKEY_NO_FORMAT = "1",
  }
end

local function stopTerminationTimers(run)
  if not run then return end
  stopTimer(run.terminationTimer)
  stopTimer(run.terminationPoll)
  run.terminationTimer = nil
  run.terminationPoll = nil
end

local function processGroupRows(run)
  if not run or not tostring(run.processGroupId or ""):match("^%d+$")
    or run.processGroupId ~= run.taskPid then return {}, nil end
  local output, ok = hs.execute("/bin/ps -ax -o pid=,pgid=,command=", true)
  if ok ~= true or type(output) ~= "string" then return nil, "process-group-table-unavailable" end
  local rows = {}
  for line in output:gmatch("[^\n]+") do
    local pid, pgid, commandLine = line:match("^%s*(%d+)%s+(%d+)%s+(.+)$")
    if pid and tonumber(pgid) == run.processGroupId then
      table.insert(rows, { pid = tonumber(pid), pgid = tonumber(pgid), command = commandLine })
    end
  end
  return rows, nil
end

local function taskRunning(run)
  if not run or not run.task then return false end
  local ok, running = pcall(function() return run.task:isRunning() end)
  if not ok then return nil end
  if running == true then return true end
  local rows = processGroupRows(run)
  if rows == nil then return nil end
  return #rows > 0
end

local function signalTask(run, signal)
  if not run or not run.task then return false end
  local rows = processGroupRows(run)
  if rows == nil then return false end
  if #rows > 0 then
    local groupSignal = signal == "interrupt" and "INT" or "TERM"
    local _, signalled = hs.execute("/bin/kill -" .. groupSignal .. " -- -" .. tostring(run.processGroupId), true)
    return signalled == true
  end
  local ok, result = pcall(function()
    if signal == "interrupt" then return run.task:interrupt() end
    return run.task:terminate()
  end)
  return ok and result ~= false
end

local function hardKillTask(run)
  if not run or not run.task then return false end
  local rows = processGroupRows(run)
  if rows == nil then return false end
  if #rows > 0 then
    local _, killed = hs.execute("/bin/kill -KILL -- -" .. tostring(run.processGroupId), true)
    return killed == true
  end
  local ok, pid = pcall(function() return run.task:pid() end)
  if not ok or not tostring(pid or ""):match("^%d+$") then return false end
  local _, killed = hs.execute("/bin/kill -KILL " .. tostring(pid), true)
  return killed == true
end

local function finishCancelledWhenStopped(run)
  if activeRun ~= run then return end
  local running = taskRunning(run)
  if running == false then
    finishRun(run, 130, "", run.cancelReason or "Cancelled")
    return
  end
  stopTimer(run.terminationPoll)
  run.terminationPoll = hs.timer.doAfter(terminationPollSeconds, function()
    finishCancelledWhenStopped(run)
  end)
end

local function beginCancellation(run)
  stopTerminationTimers(run)
  if taskRunning(run) == false then
    finishCancelledWhenStopped(run)
    return
  end
  signalTask(run, "interrupt")
  run.terminationTimer = hs.timer.doAfter(terminationGraceSeconds, function()
    if activeRun ~= run then return end
    if taskRunning(run) == false then finishCancelledWhenStopped(run); return end
    signalTask(run, "terminate")
    run.terminationTimer = hs.timer.doAfter(terminationGraceSeconds, function()
      if activeRun ~= run then return end
      if taskRunning(run) == false then finishCancelledWhenStopped(run); return end
      hardKillTask(run)
      finishCancelledWhenStopped(run)
    end)
  end)
end

local function waitForTaskExit(run, timeoutSeconds)
  local deadline = hs.timer.absoluteTime() + math.floor(timeoutSeconds * 1000000000)
  local running = taskRunning(run)
  while running ~= false and hs.timer.absoluteTime() < deadline do
    hs.timer.usleep(50000)
    running = taskRunning(run)
  end
  return running == false
end

local function cancelSynchronously(run)
  stopTerminationTimers(run)
  if waitForTaskExit(run, 0) then finishCancelledWhenStopped(run); return true end
  signalTask(run, "interrupt")
  if waitForTaskExit(run, terminationGraceSeconds) then finishCancelledWhenStopped(run); return true end
  signalTask(run, "terminate")
  if waitForTaskExit(run, terminationGraceSeconds) then finishCancelledWhenStopped(run); return true end
  hardKillTask(run)
  if waitForTaskExit(run, terminationGraceSeconds) then finishCancelledWhenStopped(run); return true end
  return false
end

finishRun = function(run, exitCode, stdout, stderr)
  if activeRun ~= run then return end
  local running = taskRunning(run)
  if running ~= false then
    run.cancelled = true
    run.cancelReason = running == nil
      and "Process-group quiescence could not be proven"
      or "VoxKey left a live descendant; process group terminated"
    beginCancellation(run)
    return
  end
  activeRun = nil
  stopHeartbeat()
  stopTerminationTimers(run)
  releaseOwnership()
  if escapeHotkey then escapeHotkey:disable() end
  if run.cancelled then
    showFlow("cancelled", run.cancelReason or "Cancelled", run, run.cancelReason and 3.5 or 1.2)
    return
  end
  local text = trim(stdout)
  local errors = trim(stderr)
  if exitCode ~= 0 or text == "" then
    showFlow("error", errors ~= "" and errors or "No speech detected", run, 3.5)
    return
  end
  if not run.targetApp or not run.targetApp:isRunning() then
    showFlow("error", "Original app is no longer available", run, 3.5)
    return
  end
  local frontmost = hs.application.frontmostApplication()
  local current = focusedElement()
  if secureInputEnabled() or not frontmost or frontmost:pid() ~= run.targetPid or not current or isSecureElement(current) or not sameTarget(run, current) then
    showFlow("error", "Focus changed; text was not typed", run, 3.5)
    return
  end
  hs.eventtap.keyStrokes(text)
  showFlow("success", "Inserted", run, 1.2)
end

cancelRun = function(reason, options)
  local run = activeRun
  if not run then return end
  if type(reason) ~= "string" then reason = nil end
  if run.cancelled then
    if options and options.synchronous then return cancelSynchronously(run) end
    return
  end
  run.cancelled = true
  run.cancelReason = reason or "Cancelled"
  run.recording = false
  stopHeartbeat()
  if escapeHotkey then escapeHotkey:disable() end
  showFlow("cancelled", reason or "Cancelled", run, reason and 3.5 or 1.2)
  if options and options.synchronous then return cancelSynchronously(run) end
  beginCancellation(run)
end

local function startRecording()
  if activeRun then return end
  if not loadInstallReceipt() then
    showFlow("error", "Install receipt invalid; run doctor", nil, 4)
    return
  end
  local conflicts, inspectionError = activeConflicts()
  if not conflicts then
    showFlow("error", inspectionError or "Process inspection failed", nil, 4)
    return
  end
  if #conflicts > 0 then
    showFlow("error", "Another voice listener is active", nil, 4)
    return
  end
  local target, targetError = captureTarget()
  if not target then
    showFlow("error", targetError, nil, 3.5)
    return
  end
  if not acquireOwnership() then
    showFlow("error", "Another voice listener owns push-to-talk", nil, 4)
    return
  end

  runId = runId + 1
  local run = {
    id = runId,
    recording = true,
    released = false,
    targetApp = target.app,
    targetPid = target.appPid,
    targetElement = target.element,
    targetRole = target.role,
    targetSubrole = target.subrole,
    targetIdentifier = target.identifier,
    targetWindow = target.window,
  }
  activeRun = run
  showFlow("recording", "Listening", run)
  startHeartbeat(run)
  if escapeHotkey then escapeHotkey:enable() end

  run.task = hs.task.new(runtimePython, function(exitCode, stdout, stderr)
    finishRun(run, exitCode, stdout, stderr)
  end, nil, { "-c", sessionLauncher, command, "record" })
  if run.task and run.task.setEnvironment then run.task:setEnvironment(taskEnvironment()) end
  if not run.task or not run.task:start() then
    activeRun = nil
    stopHeartbeat()
    releaseOwnership()
    if escapeHotkey then escapeHotkey:disable() end
    showFlow("error", "VoxKey failed to start; run doctor", run, 4)
  else
    local ok, pid = pcall(function() return run.task:pid() end)
    if not ok or not tostring(pid or ""):match("^%d+$") then
      cancelRun("VoxKey process-group identity could not be captured")
    else
      run.taskPid = tonumber(pid)
      run.processGroupId = tonumber(pid)
    end
  end
end

local function stopRecording()
  local run = activeRun
  if not run or run.released then return end
  run.released = true
  run.recording = false
  stopHeartbeat()
  showFlow("transcribing", "Transcribing", run)
  local running = taskRunning(run)
  if running ~= false then
    signalTask(run, "terminate")
    stopTimer(run.terminationTimer)
    run.terminationTimer = hs.timer.doAfter(transcriptionTimeoutSeconds, function()
      if activeRun == run and taskRunning(run) ~= false then
        cancelRun("Transcription timed out; process terminated")
      end
    end)
  else
    finishRun(run, 1, "", "VoxKey stopped before transcription")
  end
end

local function hotkeyAvailable()
  if hs.hotkey.systemAssigned then
    local assignment = hs.hotkey.systemAssigned(modifiers, key)
    local enabledAssignment = assignment ~= nil and assignment ~= false
    if type(assignment) == "table" and assignment.enabled == false then enabledAssignment = false end
    if enabledAssignment then return false, "Ctrl+Space is still assigned by macOS" end
  end
  if hs.hotkey.assignable and not hs.hotkey.assignable(modifiers, key) then
    return false, "Ctrl+Space is not assignable"
  end
  return true
end

function M.bind()
  if not loadInstallReceipt() then
    showFlow("error", "Install receipt invalid; run doctor", nil, 5)
    return nil
  end
  local available, reason = hotkeyAvailable()
  if not available then
    showFlow("error", reason, nil, 5)
    return nil
  end
  local conflicts, inspectionError = activeConflicts()
  if not conflicts then
    showFlow("error", inspectionError or "Process inspection failed", nil, 5)
    return nil
  end
  if #conflicts > 0 then
    showFlow("error", "Stop the other voice listener first", nil, 5)
    return nil
  end
  if hotkey then hotkey:delete() end
  hotkey = hs.hotkey.new(modifiers, key, startRecording, stopRecording)
  if not hotkey then
    showFlow("error", "Ctrl+Space binding failed", nil, 5)
    return nil
  end
  local enabled = hotkey:enable()
  if not enabled then
    hotkey:delete()
    hotkey = nil
    showFlow("error", "Ctrl+Space could not be enabled", nil, 5)
    return nil
  end
  if stateWatcher then stateWatcher:start() end
  M.hotkey = hotkey
  return hotkey
end

function M.stop(options)
  local synchronous = options and options.synchronous == true
  cancelRun(synchronous and "Hammerspoon is shutting down; recording cancelled" or nil, { synchronous = synchronous })
  if hotkey then hotkey:disable() end
  stopTimer(flow.timer)
  stopTimer(flow.hideTimer)
  if flow.canvas then flow.canvas:hide() end
  if stateWatcher then stateWatcher:stop() end
  if not activeRun then releaseOwnership() end
end

function M.unbind(options)
  M.stop(options)
  if hotkey then hotkey:delete(); hotkey = nil end
  M.hotkey = nil
end

function M.status()
  return {
    active = activeRun ~= nil,
    bound = hotkey ~= nil,
    command = command,
    hotkey = "ctrl+space",
    maxRecordingSeconds = maxRecordingSeconds,
    transcriptionTimeoutSeconds = transcriptionTimeoutSeconds,
    formatter = "disabled",
    autoSubmit = false,
  }
end

escapeHotkey = hs.hotkey.new({}, "escape", cancelRun)
escapeHotkey:disable()

stateWatcher = hs.caffeinate.watcher.new(function(event)
  if event == hs.caffeinate.watcher.systemWillSleep
    or event == hs.caffeinate.watcher.systemWillPowerOff
    or event == hs.caffeinate.watcher.screensDidLock
    or event == hs.caffeinate.watcher.sessionDidResignActive then
    cancelRun("Session unavailable; recording cancelled")
  end
end)

local prior = rawget(_G, "YURI_VOXKEY")
if prior and prior ~= M and prior.unbind then pcall(function() prior.unbind() end) end
_G.YURI_VOXKEY = M

hs.shutdownCallback = function()
  M.unbind({ synchronous = true })
  if previousShutdownCallback then previousShutdownCallback() end
end

M.bind()
return M
