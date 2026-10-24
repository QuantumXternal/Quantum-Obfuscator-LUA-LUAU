-- deobfuscated by SL | Source Leak | https://discord.gg/x7YbZeezpm

local players = game:GetService("Players")
local coreGui = game:GetService("CoreGui")
local replicatedStorage = game:GetService("ReplicatedStorage")
local runService = game:GetService("RunService")
local userInputService = game:GetService("UserInputService")
local tweenService = game:GetService("TweenService")
local lighting = game:GetService("Lighting")
local virtualInputManager = game:GetService("VirtualInputManager")
local guiService = game:GetService("GuiService")
local teleportService = game:GetService("TeleportService")
local httpService = game:GetService("HttpService")

loadstring(game:HttpGet("https://raw.githubusercontent.com/yuvic123/Unthinkable-Present/refs/heads/main/UP"))()
loadstring(game:HttpGet("https://raw.githubusercontent.com/YuvicHaha/batoon/refs/heads/main/bat"))()

if not game:IsLoaded() then
  game.Loaded:Wait()
end

while true do
  if players.LocalPlayer.Character:FindFirstChild("FULLY_LOADED_CHAR") then
    break
  end

  task.wait()
end

ReplicatedStorage = replicatedStorage
Players = players
RunService = runService
UserInputService = userInputService
TweenService = tweenService
Lighting = lighting
VirtualInputManager = virtualInputManager
LocalPlayer = Players.LocalPlayer
Camera = workspace.CurrentCamera
Mouse = LocalPlayer:GetMouse()
workspace.FallenPartsDestroyHeight = (0 / 0)
shopFolder = workspace:FindFirstChild("Ignored") and workspace.Ignored:FindFirstChild("Shop")

function findShopItem(p1)
  if not shopFolder or not shopFolder.Parent then
    local ignored = workspace:FindFirstChild("Ignored")
    shopFolder = ignored and ignored:FindFirstChild("Shop")

    if not shopFolder then
      return nil
    end

    for index, value in ipairs(shopFolder:GetChildren()) do
      if value.Name:find(p1, 1, true) then
        return value
      end
    end

    return nil
  end

  for index2, value2 in ipairs(shopFolder:GetChildren()) do
    if value2.Name:find(p1, 1, true) then
      return value2
    end
  end

  return nil
end

GUI = loadstring(game:HttpGet("https://raw.githubusercontent.com/YuvicHaha/ui-testing/refs/heads/main/16"))()
UI = GUI:CreateWindow("SkidoV3.4", "Noice")
Legit = UI:addPage("Legit", 2, false, 6)
Main = UI:addPage("Main", 5, true, 6)
Target = UI:addPage("Targets", 2, false, 6)
Teleports = UI:addPage("Teleports", 3, false, 6)
Guns = UI:addPage("Guns", 4, false, 6)
Misc = UI:addPage("Toggles", 5, false, 6)
Visual = UI:addPage("Visual", 5, false, 6)
Character = UI:addPage("Character", 5, false, 6)

if coreGui:FindFirstChild("StandaloneLogs") then
  coreGui.StandaloneLogs:Destroy()
end

logGui = Instance.new("ScreenGui")
logGui.Name = "StandaloneLogs"
logGui.Parent = coreGui
logGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
logGui.ResetOnSpawn = false

activeLogs = {}
MAX_LOGS = 3
LOG_W = 205
LOG_W_AVATAR = 235
LOG_H = 32
LOG_PAD = 6

function GetPlayerFromCharacter(p2)
  for index3, value3 in ipairs(Players:GetPlayers()) do
    if value3.Character == p2 then
      return value3
    end
  end
end

function Notify(text, p3, p4)
  local v1 = p3
  v1 = v1 or 3

  local logWAVATAR = p4 and LOG_W_AVATAR or LOG_W

  local notificationLog = Instance.new("Frame")
  notificationLog.Name = "NotificationLog"
  notificationLog.Parent = logGui
  notificationLog.BackgroundColor3 = Color3.fromRGB(18, 18, 24)
  notificationLog.BackgroundTransparency = 0.18
  notificationLog.BorderSizePixel = 0
  notificationLog.ClipsDescendants = true
  notificationLog.AnchorPoint = Vector2.new(0, 0.5)
  notificationLog.Size = UDim2.new(0, 0, 0, LOG_H)
  notificationLog.Position = UDim2.new(0, 18, 0.5, 0)
  notificationLog.ZIndex = 10

  local uiCorner = Instance.new("UICorner")
  uiCorner.CornerRadius = UDim.new(0, 7)
  uiCorner.Parent = notificationLog

  local uiStroke = Instance.new("UIStroke")
  uiStroke.Color = Color3.new(1, 1, 1)
  uiStroke.Transparency = 0.88
  uiStroke.Thickness = 1
  uiStroke.Parent = notificationLog

  local uiGradient = Instance.new("UIGradient")

  uiGradient.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(35, 35, 45)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(17, 17, 22)),
  })

  uiGradient.Transparency = NumberSequence.new({
    NumberSequenceKeypoint.new(0, 0.08), NumberSequenceKeypoint.new(1, 0.18),
  })

  uiGradient.Rotation = 90
  uiGradient.Parent = notificationLog

  local accent = Instance.new("Frame")
  accent.Name = "Accent"
  accent.Parent = notificationLog
  accent.BackgroundColor3 = Color3.fromRGB(139, 92, 246)
  accent.BackgroundTransparency = 0.1
  accent.BorderSizePixel = 0
  accent.Position = UDim2.new(0, 0, 0.5, -7)
  accent.Size = UDim2.new(0, 2, 0, 14)
  accent.ZIndex = 12

  Instance.new("UICorner", accent).CornerRadius = UDim.new(1, 0)

  local label = Instance.new("TextLabel")
  label.Name = "Label"
  label.Parent = notificationLog
  label.BackgroundTransparency = 1
  label.Font = Enum.Font.Roboto
  label.Text = text or "Log Notice"
  label.TextColor3 = Color3.fromRGB(235, 235, 240)
  label.TextSize = 11
  label.TextTransparency = 1
  label.TextXAlignment = Enum.TextXAlignment.Left
  label.TextYAlignment = Enum.TextYAlignment.Center
  label.TextTruncate = Enum.TextTruncate.AtEnd
  label.ZIndex = 13

  local avatar

  if p4 then
    avatar = Instance.new("ImageLabel")
    avatar.Name = "Avatar"
    avatar.Parent = notificationLog
    avatar.BackgroundColor3 = Color3.fromRGB(30, 30, 38)
    avatar.BackgroundTransparency = 0.15
    avatar.BorderSizePixel = 0
    avatar.Position = UDim2.new(0, 7, 0.5, -11)
    avatar.Size = UDim2.new(0, 22, 0, 22)
    avatar.Image = "rbxthumb://type=AvatarHeadShot&id=" .. p4 .. "&w=420&h=420"
    avatar.ImageTransparency = 1
    avatar.ZIndex = 13

    Instance.new("UICorner", avatar).CornerRadius = UDim.new(1, 0)

    label.Position = UDim2.new(0, 37, 0, 0)
    label.Size = UDim2.new(1, -44, 1, 0)
  else
    label.Position = UDim2.new(0, 10, 0, 0)
    label.Size = UDim2.new(1, -17, 1, 0)
  end

  for i = #activeLogs, 1, -1 do
    local v2 = activeLogs[i]

    if v2 and v2.Frame and v2.Frame.Parent then
      v2.TargetY = v2.TargetY - (LOG_H + LOG_PAD)

      if #activeLogs - i >= MAX_LOGS - 1 then
        task.spawn(function()
          v2.Frame:TweenSize(UDim2.new(0, 0, 0, LOG_H), "In", "Quad", 0.16, true)
          task.wait(0.17)

          if v2.Frame then
            v2.Frame:Destroy()
          end
        end)

        table.remove(activeLogs, i)
      else
        v2.Frame:TweenPosition(UDim2.new(0, 18, 0.5, v2.TargetY), "Out", "Quad", 0.22, true)
      end
    end
  end

  table.insert(activeLogs, {
    Frame = notificationLog,
    Label = label,
    Avatar = avatar,
    TargetY = 0,
  })

  notificationLog:TweenSize(UDim2.new(0, logWAVATAR, 0, LOG_H), "Out", "Quad", 0.24, true)

  task.spawn(function()
    task.wait(0.06)

    TweenService:Create(label, TweenInfo.new(
      0.16, Enum.EasingStyle.Quad, Enum.EasingDirection.Out
    ), { TextTransparency = 0 }):Play()

    if avatar then
      TweenService:Create(avatar, TweenInfo.new(
        0.16, Enum.EasingStyle.Quad, Enum.EasingDirection.Out
      ), { ImageTransparency = 0 }):Play()
    end
  end)

  task.spawn(function()
    task.wait(v1)

    if notificationLog and notificationLog.Parent then
      TweenService:Create(label, TweenInfo.new(
        0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.In
      ), { TextTransparency = 1 }):Play()

      if avatar then
        TweenService:Create(avatar, TweenInfo.new(
          0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.In
        ), { ImageTransparency = 1 }):Play()
      end

      notificationLog:TweenSize(UDim2.new(0, 0, 0, LOG_H), "In", "Quad", 0.18, true)
      task.wait(0.19)

      if notificationLog then
        notificationLog:Destroy()
      end
    end
  end)
end

function SetupDamageDetection(p5)
  local waitForChild = p5:WaitForChild("BodyEffects", 12)
  local waitForChild2 = waitForChild and waitForChild:WaitForChild("LastDamager", 12)

  if waitForChild2 then
    waitForChild2:GetPropertyChangedSignal("Value"):Connect(function()
      local value4 = waitForChild2.Value

      if value4 and value4:IsA("Model") then
        local v3 = GetPlayerFromCharacter(value4)

        if v3 then
          Notify("Hit by " .. v3.Name, 4, v3.UserId)
        end
      end
    end)
  end
end

SetupDamageDetection(LocalPlayer.Character or LocalPlayer.CharacterAdded:Wait())

LocalPlayer.CharacterAdded:Connect(SetupDamageDetection)
FlySpeed = 300
FlyLoop = nil
IsFlying = false
CFrameSpeed = 3
CFrameLoop = nil
IsCFrameActive = false
WalkSpeedValue = 40
WalkSpeedConnection = nil
WalkSpeedEnabled = false
FlyTrack = nil
HoverTrack = nil

FlyAnimation = Instance.new("Animation")
FlyAnimation.AnimationId = "rbxassetid://3541114300"

HoverAnimation = Instance.new("Animation")
HoverAnimation.AnimationId = "rbxassetid://3541044388"

function GetPing()
  return 60
end

function IsTargetKO(p6)
  if not p6 or not p6.Character then
    return true
  else
    local character = p6.Character
    local bodyEffects = character:FindFirstChild("BodyEffects")

    local ko = bodyEffects
      and (bodyEffects:FindFirstChild("KO") or bodyEffects:FindFirstChild("K.O")
        or bodyEffects:FindFirstChild("KnockedOut"))

    local dead = bodyEffects
      and (bodyEffects:FindFirstChild("Dead") or bodyEffects:FindFirstChild("Death"))

    local humanoid = character:FindFirstChildOfClass("Humanoid")
    return ko and ko.Value or dead and dead.Value or humanoid and humanoid.Health <= 0 or false
  end
end

Camera2 = workspace.CurrentCamera
desync_setback = workspace:FindFirstChild("Desync Setback")

if not desync_setback then
  desync_setback = Instance.new("Part")
  desync_setback.Name = "Desync Setback"
  desync_setback.Size = Vector3.new(2, 2, 1)
  desync_setback.CanCollide = false
  desync_setback.Anchored = true
  desync_setback.Transparency = 1
  desync_setback.Parent = workspace
end

desync = {
  enabled = false,
  mode = "Unkillable",
  tpPos = Vector3.new(),
  old = nil,
}

function resetcam()
  local humanoid2 = LocalPlayer.Character
    and LocalPlayer.Character:FindFirstChildOfClass("Humanoid")

  if humanoid2 then
    Camera2.CameraSubject = humanoid2
  end
end

function toggleDesync(p7)
  desync.enabled = p7

  if p7 then
    Camera2.CameraSubject = desync_setback
    Notify("Desync Enabled (" .. desync.mode .. ")", 2.5)
  else
    resetcam()
    Notify("Desync Disabled", 1.5)
  end
end

RunService.Heartbeat:Connect(function()
  if not desync.enabled or not LocalPlayer.Character then
    return
  else
    local humanoidRootPart = LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

    if not humanoidRootPart then
      return
    end

    desync.old = humanoidRootPart.CFrame

    if desync.mode == "Destroy Cheaters" then
      desync.tpPos = Vector3.new(11223344556678000000, 1, 1)
    elseif desync.mode == "Unkillable" then
      desync.tpPos = humanoidRootPart.Position + Vector3.new(
        math.random(-444444, 444444), math.random(-444444, 444444), math.random(-44444, 44444)
      )
    elseif desync.mode == "Simple Blink" then
      desync.tpPos = desync.old.Position + Vector3.new(
        math.random(-120, 120), math.random(-120, 120), math.random(-120, 120)
      )
    elseif desync.mode == "Underground" then
      desync.tpPos = humanoidRootPart.Position + Vector3.new(0, -14, 0)
    elseif desync.mode == "Jitter" then
      desync.tpPos = humanoidRootPart.Position
        + Vector3.new(math.random(-15, 15), 0, math.random(-15, 15))
    end

    if desync.mode ~= "Rotation" then
      humanoidRootPart.CFrame = CFrame.new(desync.tpPos)
      Camera2.CameraSubject = desync_setback
      RunService.RenderStepped:Wait()
      desync_setback.CFrame = desync.old * CFrame.new(0, humanoidRootPart.Size.Y / 2 + 0.5, 0)
      humanoidRootPart.CFrame = desync.old
    end

    return
  end
end)

LocalPlayer.CharacterAdded:Connect(function(character2)
  local waitForChild3 = character2:WaitForChild("Humanoid", 5)

  if desync.enabled then
    Camera2.CameraSubject = desync_setback
  elseif waitForChild3 then
    Camera2.CameraSubject = waitForChild3
  end

  if not desync_setback or not desync_setback.Parent then
    desync_setback = Instance.new("Part")
    desync_setback.Name = "Desync Setback"
    desync_setback.Size = Vector3.new(2, 2, 1)
    desync_setback.CanCollide = false
    desync_setback.Anchored = true
    desync_setback.Transparency = 1
    desync_setback.Parent = workspace
  end
end)

stomp_anchor = workspace:FindFirstChild("Stomp_Setback")

if not stomp_anchor then
  stomp_anchor = Instance.new("Part")
  stomp_anchor.Name = "Stomp_Setback"
  stomp_anchor.Size = Vector3.new(2, 2, 1)
  stomp_anchor.Anchored = true
  stomp_anchor.CanCollide = false
  stomp_anchor.Transparency = 1
  stomp_anchor.Parent = workspace
end

stompState = {
  enabled = false,
  active = false,
  targetCFrame = nil,
  oldCFrame = nil,
  nearbyEnabled = false,
  nearbyRange = 15,
  visual = false,
  savedCameraSubject = nil,
  savedCameraOffset = nil,
  savedHumanoid = nil,
  frame = nil,
}

visualizerDummy = nil

local function f1()
  local frame = stompState.frame

  if frame then
    if frame.root and frame.root.Parent then
      frame.root.CFrame = frame.oldCFrame
    end

    if frame.humanoid and frame.humanoid.Parent then
      frame.humanoid.CameraOffset = frame.cameraOffset
    end

    stompState.frame = nil
  end

  local savedHumanoid = stompState.savedHumanoid

  if savedHumanoid and savedHumanoid.Parent and stompState.savedCameraOffset ~= nil then
    savedHumanoid.CameraOffset = stompState.savedCameraOffset
  end

  local humanoid3 = LocalPlayer.Character
    and LocalPlayer.Character:FindFirstChildOfClass("Humanoid")

  local savedCameraSubject = stompState.savedCameraSubject

  if savedCameraSubject and savedCameraSubject.Parent and savedCameraSubject ~= stomp_anchor then
    Camera2.CameraSubject = savedCameraSubject
  elseif humanoid3 then
    Camera2.CameraSubject = humanoid3
  end

  stompState.savedCameraSubject = nil
  stompState.savedCameraOffset = nil
  stompState.savedHumanoid = nil
end

function resetCamera()
  local humanoid4 = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("Humanoid")

  if humanoid4 then
    Camera2.CameraSubject = humanoid4
  end
end

local function f2()
  local character3 = LocalPlayer.Character
  local humanoid5 = character3 and character3:FindFirstChildOfClass("Humanoid")

  if not humanoid5 then
    return false
  end

  if not stompState.savedHumanoid then
    stompState.savedCameraSubject = Camera2.CameraSubject
    stompState.savedCameraOffset = humanoid5.CameraOffset
    stompState.savedHumanoid = humanoid5
  end

  Camera2.CameraSubject = humanoid5
  return true
end

local function f3()
  stompState.active = false
  stompState.targetCFrame = nil
  stompState.oldCFrame = nil

  f1()
  togglePhysicsRep(false)
end

function togglePhysicsRep(p8)
  if not sethiddenproperty then
    return
  end

  local humanoidRootPart2 = LocalPlayer.Character
    and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

  if humanoidRootPart2 then
    pcall(function()
      if p8 then
        sethiddenproperty(humanoidRootPart2, "PhysicsRepRootPart", nil)
      else
        sethiddenproperty(humanoidRootPart2, "PhysicsRepRootPart", humanoidRootPart2)
      end
    end)
  end
end

function handleVisualizer()
  if stompState.visual and stompState.active and stompState.targetCFrame then
    if not visualizerDummy then
      local character4 = LocalPlayer.Character

      if character4 then
        character4.Archivable = true

        visualizerDummy = character4:Clone()
        visualizerDummy.Name = "Stomp_Visualizer"

        for index4, value5 in ipairs(visualizerDummy:GetDescendants()) do
          if value5:IsA("BasePart") or value5:IsA("Decal") then
            value5.Transparency = 0.5

            if value5:IsA("BasePart") then
              value5.Material = Enum.Material.ForceField
              value5.Color = Color3.fromRGB(255, 0, 0)
              value5.CanCollide = false
              value5.Anchored = true
            end
          elseif value5:IsA("Script") or value5:IsA("LocalScript") then
            value5:Destroy()
          end
        end

        visualizerDummy.Parent = workspace
      end
    end

    if visualizerDummy then
      visualizerDummy:PivotTo(stompState.targetCFrame)
    end
  elseif visualizerDummy then
    visualizerDummy:Destroy()
    visualizerDummy = nil
  end
end

RunService.Heartbeat:Connect(function()
  if stompState.active and stompState.targetCFrame then
    if stompState.frame then
      return
    else
      local character5 = LocalPlayer.Character
      local humanoidRootPart3 = character5 and character5:FindFirstChild("HumanoidRootPart")

      local humanoid6 = character5
      humanoid6 = character5 and character5:FindFirstChildOfClass("Humanoid")

      local v4 = not humanoidRootPart3
      local v5 = humanoid6

      if v4 or not v5 then
        return
      end

      local cframe = humanoidRootPart3.CFrame
      local targetCFrame = stompState.targetCFrame
      local v6 = cframe - cframe.Position

      local v7 = {
        root = humanoidRootPart3,
        humanoid = v5,
        oldCFrame = cframe,
        cameraOffset = v5.CameraOffset,
      }

      stompState.frame = v7
      stompState.oldCFrame = cframe

      v5.CameraOffset = v6:VectorToObjectSpace(cframe.Position - targetCFrame.Position)
      stomp_anchor.CFrame = cframe
      humanoidRootPart3.CFrame = CFrame.new(targetCFrame.Position) * v6
      handleVisualizer()
      RunService.RenderStepped:Wait()

      if stompState.frame == v7 then
        if humanoidRootPart3 and humanoidRootPart3.Parent then
          humanoidRootPart3.CFrame = cframe
        end

        if v5 and v5.Parent then
          v5.CameraOffset = v7.cameraOffset
        end

        stompState.frame = nil
      end

      return
    end
  else
    handleVisualizer()
    return
  end
end)

LocalPlayer.CharacterAdded:Connect(function(character6)
  local frame2 = stompState.frame

  if frame2 then
    if frame2.root and frame2.root.Parent then
      frame2.root.CFrame = frame2.oldCFrame
    end

    if frame2.humanoid and frame2.humanoid.Parent then
      frame2.humanoid.CameraOffset = frame2.cameraOffset
    end

    stompState.frame = nil
  end

  stompState.active = false
  stompState.targetCFrame = nil
  stompState.oldCFrame = nil
  stompState.savedCameraSubject = nil
  stompState.savedCameraOffset = nil
  stompState.savedHumanoid = nil

  task.defer(function()
    local humanoid7 = character6:FindFirstChildOfClass("Humanoid")
      or character6:WaitForChild("Humanoid", 5)

    if humanoid7 then
      humanoid7.CameraOffset = Vector3.zero
      Camera2.CameraSubject = humanoid7
    end
  end)
end)

function getTargetClosestToMouse()
  local getMouse = LocalPlayer:GetMouse()
  local huge = math.huge
  local players2 = Players
  local v8

  for index5, value6 in ipairs(players2:GetPlayers()) do
    if value6 ~= LocalPlayer and value6.Character then
      local upperTorso = value6.Character:FindFirstChild("UpperTorso")
        or value6.Character:FindFirstChild("Torso")
        or value6.Character:FindFirstChild("HumanoidRootPart")

      local humanoid8 = value6.Character:FindFirstChildOfClass("Humanoid")
      local bodyEffects2 = value6.Character:FindFirstChild("BodyEffects")

      local kO = bodyEffects2

      kO = bodyEffects2 and bodyEffects2:FindFirstChild("K.O")
        and bodyEffects2["K.O"].Value == true

      local dead2 = bodyEffects2

      dead2 = bodyEffects2 and bodyEffects2:FindFirstChild("Dead")
        and bodyEffects2.Dead.Value == true

      if upperTorso and humanoid8 and humanoid8.Health > 0 and kO and not dead2 then
        local v9, v10 = Camera2:WorldToViewportPoint(upperTorso.Position)

        if v10 then
          local magnitude = (Vector2.new(getMouse.X, getMouse.Y)
            - Vector2.new(v9.X, v9.Y)).Magnitude

          if magnitude < huge then
            huge = magnitude
            v8 = value6
          end
        end
      end
    end
  end

  return v8
end

function getTargetNearby()
  local humanoidRootPart4 = LocalPlayer.Character
    and (LocalPlayer.Character:FindFirstChild("HumanoidRootPart")
      or LocalPlayer.Character:FindFirstChild("Torso"))

  if not humanoidRootPart4 then
    return
  else
    local nearbyRange = stompState.nearbyRange
    local v11 = nil

    for index6, value7 in ipairs(Players:GetPlayers()) do
      if value7 ~= LocalPlayer and value7.Character then
        local upperTorso2 = value7.Character:FindFirstChild("UpperTorso")
          or value7.Character:FindFirstChild("Torso")
          or value7.Character:FindFirstChild("HumanoidRootPart")

        local humanoid9 = value7.Character:FindFirstChildOfClass("Humanoid")
        local bodyEffects3 = value7.Character:FindFirstChild("BodyEffects")

        local kO2 = bodyEffects3

        kO2 = bodyEffects3 and bodyEffects3:FindFirstChild("K.O")
          and bodyEffects3["K.O"].Value == true

        local dead3 = bodyEffects3

        dead3 = bodyEffects3 and bodyEffects3:FindFirstChild("Dead")
          and bodyEffects3.Dead.Value == true

        if upperTorso2 and humanoid9 and humanoid9.Health > 0 and kO2 and not dead3 then
          local magnitude2 = (humanoidRootPart4.Position - upperTorso2.Position).Magnitude

          if magnitude2 <= nearbyRange then
            nearbyRange = magnitude2
            v11 = value7
          end
        end
      end
    end

    return v11
  end
end

function runFastStomp()
  local active = not stompState.enabled or stompState.active
  local character7

  if active then
    return
  else
    local v12 = getTargetClosestToMouse()

    if not v12 or not v12.Character then
      return
    else
      character7 = v12.Character

      local upperTorso3 = character7:FindFirstChild("UpperTorso")
        or character7:FindFirstChild("Torso") or character7:FindFirstChild("HumanoidRootPart")

      if not upperTorso3 then
        return
      end

      if not f2() then
        return
      end

      stompState.active = true
      togglePhysicsRep(true)
      Notify("Stomping " .. v12.DisplayName, 3, v12.UserId)

      task.spawn(function()
        while stompState.enabled and stompState.active and character7 and character7.Parent do
          local bodyEffects4 = character7:FindFirstChild("BodyEffects")

          if bodyEffects4 and bodyEffects4:FindFirstChild("Dead")
              and bodyEffects4.Dead.Value == true
            or not (bodyEffects4 and bodyEffects4:FindFirstChild("K.O")
              and bodyEffects4["K.O"].Value == true) then
            Notify("Target Stomped", 2)
            break
          end

          stompState.targetCFrame = CFrame.new(upperTorso3.Position + Vector3.new(0, 3, 0))
          ReplicatedStorage.MainEvent:FireServer("Stomp")
          RunService.Heartbeat:Wait()
        end

        f3()
      end)

      return
    end
  end
end

function runNearbyStompLoop()
  task.spawn(function()
    while stompState.nearbyEnabled do
      if not stompState.active then
        local v13 = getTargetNearby()

        if v13 and v13.Character then
          local character8 = v13.Character

          local upperTorso4 = character8:FindFirstChild("UpperTorso")
            or character8:FindFirstChild("Torso")
            or character8:FindFirstChild("HumanoidRootPart")

          if upperTorso4 then
            if f2() then
              stompState.active = true
              togglePhysicsRep(true)
              Notify("Auto-Stomping: " .. v13.DisplayName, 3)

              while stompState.nearbyEnabled and stompState.active and character8
                and character8.Parent do
                local bodyEffects5 = character8:FindFirstChild("BodyEffects")

                if bodyEffects5 and bodyEffects5:FindFirstChild("Dead")
                    and bodyEffects5.Dead.Value == true
                  or not (bodyEffects5 and bodyEffects5:FindFirstChild("K.O")
                    and bodyEffects5["K.O"].Value == true) then
                  Notify("Nearby Target Stomped", 2)
                  break
                end

                stompState.targetCFrame = CFrame.new(upperTorso4.Position + Vector3.new(0, 3, 0))
                ReplicatedStorage.MainEvent:FireServer("Stomp")
                RunService.Heartbeat:Wait()
              end

              f3()
            else
              task.wait(0.1)
            end
          end
        end
      end

      task.wait(0.1)
    end
  end)
end

Legit:addLabel("Silent Aim", "Shoot Silent")

SA = {
  on = false,
  fov = 25,
  ring = false,
  noKO = true,
  noWall = false,
  parts = { "Head" },
  locked = nil,
}

getgenv().SA_state = SA
local touchEnabled = UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled

local function f4(index7)
  if touchEnabled then
    local getGuiInset = guiService:GetGuiInset()
    return UDim2.fromOffset(index7.X + getGuiInset.X, index7.Y + getGuiInset.Y)
  end

  return UDim2.fromOffset(index7.X, index7.Y)
end

local function f5()
  if touchEnabled then
    local viewportSize = Camera2.ViewportSize
    return Vector2.new(viewportSize.X * 0.5, viewportSize.Y * 0.5)
  end

  return UserInputService:GetMouseLocation()
end

fovGui = Instance.new("ScreenGui")
fovGui.Name = "LX_FOVRing"
fovGui.IgnoreGuiInset = true
fovGui.ResetOnSpawn = false
fovGui.DisplayOrder = 999

local v14 = fovGui
v14.Parent = gethui and gethui() or coreGui

fovFrame = Instance.new("Frame")
fovFrame.BackgroundTransparency = 1
fovFrame.AnchorPoint = Vector2.new(0.5, 0.5)
fovFrame.Visible = false
fovFrame.Parent = fovGui

Instance.new("UICorner", fovFrame).CornerRadius = UDim.new(1, 0)

fovStroke = Instance.new("UIStroke")
fovStroke.Color = Color3.fromRGB(137, 246, 255)
fovStroke.Thickness = 1.5
fovStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
fovStroke.Parent = fovFrame

function saVisible(p9)
  if not SA.noWall then
    return true
  end

  if not Camera2 or not p9 then
    return false
  else
    local tool = LocalPlayer.Character and LocalPlayer.Character:FindFirstChildWhichIsA("Tool")

    local position = tool and tool:FindFirstChild("Handle") and tool.Handle.Position
      or Camera2.CFrame.Position

    local raycastParams = RaycastParams.new()
    raycastParams.FilterType = Enum.RaycastFilterType.Exclude
    raycastParams.FilterDescendantsInstances = { LocalPlayer.Character, Camera2 }
    raycastParams.IgnoreWater = true

    local raycast = workspace:Raycast(position, p9.Position - position, raycastParams)

    if not raycast then
      return true
    end

    return raycast.Instance:IsDescendantOf(p9.Parent)
  end
end

function saPart(p10)
  for index8, value8 in ipairs(SA.parts) do
    local findFirstChild = p10:FindFirstChild(value8)

    if findFirstChild then
      return findFirstChild
    end
  end

  return p10:FindFirstChild("HumanoidRootPart") or p10:FindFirstChild("Head")
end

local v15 = identifyexecutor()

if v15 == "Solara" or v15 == "Xeno" then
  warn("Metatable hook skipped: " .. v15 .. " detected")
else
  pcall(function()
    local v16 = getrawmetatable(game)
    local index9 = v16.__index
    setreadonly(v16, false)

    v16.__index = (type(newcclosure) == "function" and newcclosure
      or function(p11) return p11 end)(function(
      p12, p13
    )
      if p12 ~= Mouse then
        return index9(p12, p13)
      end

      if p13 ~= "Hit" and p13 ~= "HitCFrame" then
        return index9(p12, p13)
      end

      if not (SA.on or SA.forcePart) then
        return index9(p12, p13)
      end

      local forcePart = SA.forcePart or SA.locked

      if not forcePart or not forcePart.Parent then
        return index9(p12, p13)
      end

      if pcall(function()
        local v17, v18 = Camera2:WorldToViewportPoint(forcePart.Position)
        local v19 = SA.forcePart ~= nil
        local v20 = math.tan(math.rad(math.min(SA.fov / 2, 89))) / math.tan(math.rad(Camera2.FieldOfView / 2)) * (Camera2.ViewportSize.Y / 2)

        if (v19 or v18 and v17.Z > 0 and (Vector2.new(v17.X, v17.Y) - f5()).Magnitude <= v20) and saVisible(forcePart) then
          SA._hitOverride = CFrame.new(forcePart.Position)
        else
          SA._hitOverride = nil
        end
      end) and SA._hitOverride then
        local hitOverride = SA._hitOverride
        SA._hitOverride = nil
        return hitOverride
      end

      SA._hitOverride = nil
      return index9(p12, p13)
    end)

    setreadonly(v16, true)
  end)
end

RunService.RenderStepped:Connect(function()
  if not SA.on then
    fovFrame.Visible = false
    SA.locked = nil
    return
  else
    local v21 = f5()

    local v22 = math.tan(math.rad(math.min(SA.fov / 2, 89)))
        / math.tan(math.rad(Camera2.FieldOfView / 2))
      * (Camera2.ViewportSize.Y / 2)

    local v23 = v22
    local locked = nil

    for index10, value9 in ipairs(Players:GetPlayers()) do
      if value9 ~= LocalPlayer and value9.Character then
        local v24 = saPart(value9.Character)
        local bodyEffects6 = value9.Character:FindFirstChild("BodyEffects")

        local kO3 = bodyEffects6
          and (bodyEffects6:FindFirstChild("K.O") or bodyEffects6:FindFirstChild("KO"))

        if v24 and not (SA.noKO and kO3 and kO3.Value) and saVisible(v24) then
          local v25, v26 = Camera2:WorldToViewportPoint(v24.Position)

          if v26 and v25.Z > 0 then
            local magnitude3 = (Vector2.new(v25.X, v25.Y) - v21).Magnitude

            if magnitude3 <= v23 then
              locked = v24
              v23 = magnitude3
            end
          end
        end
      end
    end

    SA.locked = locked

    if SA.ring then
      fovFrame.Visible = true
      fovFrame.Size = UDim2.fromOffset(v22 * 2, v22 * 2)
      fovFrame.Position = f4(v21)
    else
      fovFrame.Visible = false
    end

    return
  end
end)

Legit:AddToggle("EnableSilentAim", {
  Text = "Silent Aim",
  Default = false,
  KeybindRequiresToggle = true,
  Keybind = Enum.KeyCode.Unknown,
  KeybindPicker = true,
  HoldToggle = false,
  Callback = function(value10) SA.on = value10 end,
})

Legit:AddToggle("ShowFOV", {
  Text = "Show FOV",
  Default = false,
  KeybindRequiresToggle = false,
  Keybind = Enum.KeyCode.Unknown,
  KeybindPicker = false,
  HoldToggle = false,
  Callback = function(value11)
    SA.ring = value11

    if not value11 then
      fovFrame.Visible = false
    end
  end,
})

Legit:AddSlider("FOVSlider", {
  Text = "FOV",
  Min = 10,
  Max = 360,
  Default = 120,
  Rounding = 0,
  Callback = function(value12) SA.fov = value12 end,
})

Legit:AddDropdown("SAHitboxSelect", {
  Text = "Select Aimpart",
  Values = { "Head", "HumanoidRootPart", "UpperTorso", "LowerTorso", "LeftHand", "RightHand" },
  Default = { "Head" },
  MultiSelect = true,
  Callback = function(value13)
    local v27 = {}

    if typeof(value13) == "table" then
      for key, value14 in pairs(value13) do
        if typeof(key) == "number" and typeof(value14) == "string" then
          table.insert(v27, value14)
        elseif typeof(key) == "string" and value14 == true then
          table.insert(v27, key)
        end
      end
    end

    if #v27 == 0 then
      v27 = { "Head" }
    end

    SA.parts = v27
  end,
})

Legit:AddToggle("DontHitKO", {
  Text = "Don't Hit K.O",
  Default = true,
  KeybindRequiresToggle = false,
  Keybind = Enum.KeyCode.Unknown,
  KeybindPicker = false,
  HoldToggle = false,
  Callback = function(value15) SA.noKO = value15 end,
})

Legit:AddToggle("DontWall", {
  Text = "Don't Shoot Through Walls",
  Default = false,
  KeybindRequiresToggle = false,
  Keybind = Enum.KeyCode.Unknown,
  KeybindPicker = false,
  HoldToggle = false,
  Callback = function(value16) SA.noWall = value16 end,
})

Legit:addLabel("Camlock", "Aim Assist")

getgenv().StickyAim = false
getgenv().Camlock = false

CamlockHitParts = { "Head" }
CurrentCycleIndex = 1
LastCycleTime = 0
CycleSpeed = 0.15
UseDynamicPrediction = false
CustomPredictionValue = 0.12588
CustomPredictionY = 0.12588
PredictionOffsetY = 0
UnlockWhenKO = false
CurrentTarget = nil
TargetBodyPart = nil
CamlockConnection = nil
PositionHistory = {}
DerivedVelocity = Vector3.zero

function GetCamlockPrediction(p14)
  if not UseDynamicPrediction then
    return CustomPredictionValue
  else
    GetPing()
    local v28 = "General"

    if p14 and p14.Character and LocalPlayer.Character
      and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")
      and p14.Character:FindFirstChild("HumanoidRootPart") then
      local magnitude4 = (LocalPlayer.Character.HumanoidRootPart.Position
        - p14.Character.HumanoidRootPart.Position).Magnitude

      if magnitude4 < 30 then
        v28 = "Close"
      elseif magnitude4 < 85 then
        v28 = "Mid"
      else
        v28 = "Far"
      end
    end

    local v29 = {
      General = { 0.12588 },
      Far = { 0.1305 },
      Mid = { 0.1285 },
      Close = { 0.1265 },
    }

    return v29[v28][math.random(1, #v29[v28])]
  end
end

function GetClosestHitbox(p15)
  if not p15 or not p15.Character or #CamlockHitParts == 0 then
    return nil
  end

  if os.clock() - LastCycleTime >= CycleSpeed then
    LastCycleTime = os.clock()
    CurrentCycleIndex = CurrentCycleIndex % #CamlockHitParts + 1
  end

  for j = 0, #CamlockHitParts - 1 do
    local findFirstChild2 = p15.Character:FindFirstChild(CamlockHitParts[(CurrentCycleIndex - 1 + j)
        % #CamlockHitParts
      + 1])

    if findFirstChild2 then
      return findFirstChild2
    end
  end

  return p15.Character:FindFirstChild("HumanoidRootPart")
    or p15.Character:FindFirstChild("Head")
end

function GetClosestPlayerToMouse()
  local fovSIZE = getgenv().FOV_ENABLED and getgenv().FOV_SIZE or math.huge
  local players3 = Players
  local v30

  for index11, value17 in ipairs(players3:GetPlayers()) do
    if value17 ~= LocalPlayer and value17.Character then
      local humanoidRootPart5 = value17.Character:FindFirstChild("HumanoidRootPart")

      if humanoidRootPart5 then
        local v31, v32 = Camera2:WorldToViewportPoint(humanoidRootPart5.Position)

        local magnitude5 = (UserInputService:GetMouseLocation()
          - Vector2.new(v31.X, v31.Y)).Magnitude

        if magnitude5 < fovSIZE and v32 then
          fovSIZE = magnitude5
          v30 = value17
        end
      end
    end
  end

  return v30
end

RunService.Heartbeat:Connect(function()
  if CurrentTarget and CurrentTarget.Character
    and CurrentTarget.Character:FindFirstChild("HumanoidRootPart") then
    local humanoidRootPart6 = CurrentTarget.Character.HumanoidRootPart
    local v33 = PositionHistory[CurrentTarget]

    if v33 then
      local v34 = tick() - v33.Time

      if v34 > 0 then
        DerivedVelocity = (humanoidRootPart6.Position - v33.Position) / v34
      end
    end

    PositionHistory[CurrentTarget] = { Position = humanoidRootPart6.Position, Time = tick() }
  else
    DerivedVelocity = Vector3.zero
  end
end)

function StartCamlockEngine()
  if CamlockConnection then
    return
  end

  CamlockConnection = RunService.Heartbeat:Connect(function()
    if not getgenv().Camlock then
      return
    else
      local currentTarget = CurrentTarget

      if not currentTarget or not currentTarget.Character
        or not currentTarget.Character:FindFirstChild("HumanoidRootPart")
        or UnlockWhenKO and IsTargetKO(currentTarget) then
        if not getgenv().StickyAim then
          CurrentTarget = nil
        end

        TargetBodyPart = nil
        return
      end

      TargetBodyPart = GetClosestHitbox(currentTarget)

      if not TargetBodyPart then
        return
      else
        local position2 = TargetBodyPart.Position

        local derivedVelocity = getgenv().Resolver and DerivedVelocity ~= Vector3.zero
            and DerivedVelocity
          or currentTarget.Character.HumanoidRootPart.AssemblyLinearVelocity

        local useDynamicPrediction = UseDynamicPrediction
            and GetCamlockPrediction(currentTarget)
          or CustomPredictionValue

        local useDynamicPrediction2 = UseDynamicPrediction
            and GetCamlockPrediction(currentTarget)
          or CustomPredictionY

        local useDynamicPrediction3 = UseDynamicPrediction
            and GetCamlockPrediction(currentTarget)
          or CustomPredictionValue

        local vector = Vector3.new(
          derivedVelocity.X * useDynamicPrediction,
          derivedVelocity.Y * useDynamicPrediction2 + PredictionOffsetY,
          derivedVelocity.Z * useDynamicPrediction3
        )

        Camera2.CFrame = CFrame.new(Camera2.CFrame.Position, position2 + vector)
        return
      end
    end
  end)
end

function StopCamlockEngine()
  if CamlockConnection then
    CamlockConnection:Disconnect()
    CamlockConnection = nil
  end
end

UserInputService.InputBegan:Connect(function(input, p16)
  if p16 then
    return
  end

  if getgenv().StickyAim and input.KeyCode == Enum.KeyCode.V then
    if CurrentTarget then
      CurrentTarget = nil
    else
      local v35 = GetClosestPlayerToMouse()

      if v35 then
        CurrentTarget = v35
      end
    end
  end
end)

Legit:AddToggle("StickyAim", {
  Text = "Sticky Aim",
  Default = false,
  KeybindRequiresToggle = true,
  Keybind = Enum.KeyCode.Unknown,
  KeybindPicker = true,
  HoldToggle = false,
  Callback = function(value18)
    getgenv().StickyAim = value18

    if not value18 then
      CurrentTarget = nil
      TargetBodyPart = nil
    end
  end,
})

Legit:AddToggle("Camlock", {
  Text = "Camlock",
  Default = false,
  KeybindRequiresToggle = true,
  Keybind = Enum.KeyCode.Unknown,
  HoldToggle = true,
  Callback = function(value19)
    getgenv().Camlock = value19

    if value19 then
      if not getgenv().StickyAim or not CurrentTarget then
        CurrentTarget = GetClosestPlayerToMouse()
      end

      StartCamlockEngine()
    else
      StopCamlockEngine()

      if not getgenv().StickyAim then
        CurrentTarget = nil
        TargetBodyPart = nil
      end
    end
  end,
})

Legit:AddToggle("UnlockKO", {
  Text = "Unlocks when K.O",
  Default = false,
  Callback = function(value20) UnlockWhenKO = value20 end,
})

Legit:AddDropdown("CamlockHitbox", {
  Text = "Hitbox Select",
  Values = { "Head", "HumanoidRootPart", "UpperTorso", "LowerTorso", "LeftHand", "RightHand" },
  Default = { "Head" },
  MultiSelect = true,
  Callback = function(value21)
    local v36 = {}

    if typeof(value21) == "table" then
      for key2, value22 in pairs(value21) do
        if typeof(key2) == "number" and typeof(value22) == "string" then
          table.insert(v36, value22)
        elseif typeof(key2) == "string" and value22 == true then
          table.insert(v36, key2)
        end
      end
    end

    if #v36 == 0 then
      v36 = { "Head" }
    end

    CamlockHitParts = v36
    CurrentCycleIndex = 1
  end,
})

Legit:AddToggle("AutoPrediction", {
  Text = "Auto Prediction",
  Default = false,
  Callback = function(value23) UseDynamicPrediction = value23 end,
})

Legit:addTextBox("PredictionXZ", "0.12588", function(p17)
  local v37 = tonumber(p17)

  if v37 then
    CustomPredictionValue = v37
  end
end)

Legit:addTextBox("PredictionY", "0.12588", function(p18)
  local v38 = tonumber(p18)

  if v38 then
    CustomPredictionY = v38
  end
end)

Legit:addTextBox("PredictionOffsetY", "0", function(p19)
  local v39 = tonumber(p19)

  if v39 then
    PredictionOffsetY = v39
  end
end)

getgenv().ZAnti = false
getgenv().AntiStrength = 1000
getgenv().AntiLockConnection = nil

Legit:AddToggle("AntiLock", {
  Text = "Anti lock",
  Default = false,
  KeybindRequiresToggle = true,
  Keybind = Enum.KeyCode.Unknown,
  Callback = function(value24)
    getgenv().ZAnti = value24

    if value24 then
      if getgenv().AntiLockConnection then
        getgenv().AntiLockConnection:Disconnect()
      end

      local v40 = getgenv()

      v40.AntiLockConnection = RunService.Heartbeat:Connect(function()
        local humanoidRootPart7 = LocalPlayer.Character
          and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

        if humanoidRootPart7 then
          local velocity = humanoidRootPart7.Velocity
          humanoidRootPart7.Velocity = Vector3.new(0, 0, getgenv().AntiStrength)
          RunService.RenderStepped:Wait()

          if humanoidRootPart7 and humanoidRootPart7.Parent then
            humanoidRootPart7.Velocity = velocity
          end
        end
      end)
    elseif getgenv().AntiLockConnection then
      getgenv().AntiLockConnection:Disconnect()
      getgenv().AntiLockConnection = nil
    end
  end,
})

getgenv().Resolver = false
getgenv().ResolverConnection = nil

Legit:AddToggle("AntiLockResolver", {
  Text = "Anti-Lock Resolver",
  Default = false,
  Callback = function(value25)
    getgenv().Resolver = value25

    if value25 then
      if getgenv().ResolverConnection then
        getgenv().ResolverConnection:Disconnect()
      end

      local v41 = getgenv()

      v41.ResolverConnection = RunService.Heartbeat:Connect(function()
        pcall(function()
          for index12, value26 in ipairs(Players:GetPlayers()) do
            if value26 ~= LocalPlayer and value26.Character then
              local humanoidRootPart8 = value26.Character:FindFirstChild("HumanoidRootPart")

              if humanoidRootPart8 then
                humanoidRootPart8.Velocity = Vector3.zero
                humanoidRootPart8.AssemblyLinearVelocity = Vector3.zero
              end
            end
          end
        end)
      end)
    elseif getgenv().ResolverConnection then
      getgenv().ResolverConnection:Disconnect()
      getgenv().ResolverConnection = nil
    end
  end,
})

local localPlayer = LocalPlayer

getgenv().mouse = localPlayer:GetMouse()
getgenv().enable = false

Legit:AddToggle("Triggerbot", {
  Text = "Triggerbot",
  Default = false,
  KeybindRequiresToggle = true,
  Keybind = Enum.KeyCode.Unknown,
  Callback = function(value27)
    getgenv().enable = value27

    if value27 then
      task.spawn(function()
        while getgenv().enable do
          task.wait()
          local target = (getgenv().mouse or LocalPlayer:GetMouse()).Target

          if target and target.Parent then
            local model = target:FindFirstAncestorOfClass("Model")

            if model then
              for key3, value28 in pairs(Players:GetPlayers()) do
                if value28 ~= LocalPlayer
                  and (value28.Name == model.Name
                    or model.Parent and value28.Name == model.Parent.Name) then
                  mouse1click()
                  break
                end
              end
            end
          end
        end
      end)
    end
  end,
})

local color = Color3.fromRGB(255, 0, 255)
hitboxSize = 10
hitboxColor = color
hitboxEnabled = false
hitboxVisual = false
origMat = {}
origCol = {}

function getHRP(p20)
  return p20 and p20:FindFirstChild("HumanoidRootPart")
end

function isKO(p21)
  local bodyEffects7 = p21 and p21:FindFirstChild("BodyEffects")
  local kO4 = bodyEffects7 and bodyEffects7:FindFirstChild("K.O")
  return kO4 and kO4.Value
end

function updateHitbox(p22)
  local v42 = getHRP(p22)

  if not v42 then
    return
  end

  if not hitboxEnabled or isKO(p22) then
    v42.Size = Vector3.new(2, 1, 2)
    v42.Transparency = 1
    v42.CanCollide = true

    if origMat[v42] then
      local color2 = origCol[v42]

      v42.Material = origMat[v42]
      v42.Color = color2

      local v43 = origCol
      origMat[v42] = nil
      v43[v42] = nil
    end

    return
  else
    v42.Size = Vector3.new(hitboxSize, hitboxSize, hitboxSize)
    v42.Transparency = 0
    v42.CanCollide = false

    if not origMat[v42] then
      local v44 = origCol
      local color3 = v42.Color
      origMat[v42] = v42.Material
      v44[v42] = color3
    end

    local forceField = hitboxVisual and Enum.Material.ForceField or origMat[v42]
    local v45 = hitboxVisual and hitboxColor or origCol[v42]

    v42.Material = forceField
    v42.Color = v45

    return
  end
end

function refreshHitboxes()
  for index13, value29 in ipairs(Players:GetPlayers()) do
    if value29 ~= LocalPlayer and value29.Character then
      updateHitbox(value29.Character)
    end
  end
end

Legit:AddToggle("HitboxExpander", {
  Text = "Hitbox Expander",
  Default = false,
  Callback = function(value30)
    hitboxEnabled = value30
    refreshHitboxes()
  end,
})

Legit:AddToggle("VisualHitbox", {
  Text = "Visual Hitbox",
  Default = false,
  ColorPicker = true,
  Color = hitboxColor,
  Callback = function(value31)
    hitboxVisual = value31
    refreshHitboxes()
  end,
  ColorCallback = function(p23)
    hitboxColor = p23
    refreshHitboxes()
  end,
})

Legit:AddSlider("HitboxSize", {
  Text = "Hitbox Size",
  Min = 1,
  Max = 45,
  Default = 1,
  Rounding = 0,
  Callback = function(value32) hitboxSize = value32 end,
})

Players.PlayerAdded:Connect(function(player)
  if player.Character then
    task.defer(function()
      if hitboxEnabled then
        updateHitbox(player.Character)
      end
    end)
  end

  player.CharacterAdded:Connect(function(character9)
    if hitboxEnabled then
      task.wait()
      updateHitbox(character9)
    end
  end)
end)

RunService.Heartbeat:Connect(function()
  if not hitboxEnabled then
    return
  end

  for index14, value33 in ipairs(Players:GetPlayers()) do
    if value33 ~= LocalPlayer and value33.Character then
      updateHitbox(value33.Character)
    end
  end
end)

local dynamicAnchor = workspace:FindFirstChild("Dynamic_Anchor")

if not dynamicAnchor then
  dynamicAnchor = Instance.new("Part")
  dynamicAnchor.Name = "Dynamic_Anchor"
  dynamicAnchor.Size = Vector3.new(2, 2, 1)
  dynamicAnchor.Anchored = true
  dynamicAnchor.CanCollide = false
  dynamicAnchor.Transparency = 1
  dynamicAnchor.Parent = workspace
end

local v46 = {
  ["[LMG]"] = true,
  ["[Rifle]"] = true,
  ["[Revolver]"] = true,
  ["[DoubleBarrel]"] = true,
  ["[AUG]"] = true,
  ["[P90]"] = true,
  ["[AK47]"] = true,
  ["[SMG]"] = true,
}

local function f6(value34)
  return value34:IsA("Tool") and v46[value34.Name]
end

local v47 = {
  enabled = false,
  targetPlayer = nil,
  active = false,
  targetCFrame = nil,
  offsetHeight = 9,
  switchThreshold = 40,
  fireCooldown = 0.05,
  lastFire = 0,
  savedCameraSubject = nil,
  savedCameraOffset = nil,
  frame = nil,
}

local f7

local function f8()
  local character10 = LocalPlayer.Character

  if not character10 then
    return
  end

  for index15, value35 in ipairs(character10:GetChildren()) do
    if f6(value35) then
      if v47.enabled then
        f7(value35)
      else
        value35.Enabled = true
      end
    end
  end
end

function f7(p24)
  if not f6(p24) then
    return
  end

  if p24.Enabled then
    p24.Enabled = false
  end

  if not p24:GetAttribute("DynamicHooked") then
    p24:SetAttribute("DynamicHooked", true)

    p24:GetPropertyChangedSignal("Enabled"):Connect(function()
      if v47.enabled and p24.Enabled then
        p24.Enabled = false
      end
    end)
  end
end

LocalPlayer.CharacterAdded:Connect(function(character11)
  task.wait(0.1)

  for index16, value36 in ipairs(character11:GetChildren()) do
    if f6(value36) then
      if v47.enabled then
        f7(value36)
      else
        value36.Enabled = true
      end
    end
  end

  f8()
end)

local function f9()
  v47.active = false
  v47.targetCFrame = nil
  v47.targetPlayer = nil

  local frame3 = v47.frame

  if frame3 then
    if frame3.root and frame3.root.Parent then
      frame3.root.CFrame = frame3.oldCFrame
    end

    if frame3.humanoid and frame3.humanoid.Parent then
      frame3.humanoid.CameraOffset = frame3.cameraOffset
    end

    if frame3.oldCFrame then
      dynamicAnchor.CFrame = frame3.oldCFrame
    end

    v47.frame = nil
  end

  local character12 = LocalPlayer.Character
  local humanoid10 = character12 and character12:FindFirstChildOfClass("Humanoid")

  if humanoid10 and v47.savedCameraOffset ~= nil then
    humanoid10.CameraOffset = v47.savedCameraOffset
  end

  if Camera2 then
    local savedCameraSubject2 = v47.savedCameraSubject

    if savedCameraSubject2 and savedCameraSubject2 ~= dynamicAnchor
      and savedCameraSubject2.Parent then
      Camera2.CameraSubject = savedCameraSubject2
    elseif humanoid10 then
      Camera2.CameraSubject = humanoid10
    end
  end

  v47.savedCameraSubject = nil
  v47.savedCameraOffset = nil

  togglePhysicsRep(false)
end

local function f10(targetPlayer)
  if not targetPlayer or not targetPlayer.Character then
    return
  else
    local head = targetPlayer.Character:FindFirstChild("Head")

    if not head then
      return
    else
      local character13 = LocalPlayer.Character

      if not character13 then
        return
      else
        local mainEvent = ReplicatedStorage:FindFirstChild("MainEvent")

        if not mainEvent then
          return
        else
          local tool2 = character13:FindFirstChildOfClass("Tool")

          if not (tool2 and tool2:FindFirstChild("Handle") and tool2:FindFirstChild("Ammo")) then
            tool2 = nil

            for index17, value37 in ipairs(character13:GetChildren()) do
              if value37:IsA("Tool") and value37:FindFirstChild("Handle")
                and value37:FindFirstChild("Ammo") then
                tool2 = value37
                break
              end
            end
          end

          if not tool2 then
            return
          end

          mainEvent:FireServer(
            "ShootGun", tool2.Handle, tool2.Handle.CFrame.Position, head.Position, head,
            Vector3.new(0, 0, -1)
          )

          return
        end
      end
    end
  end
end

local function f11(targetPlayer2)
  if not targetPlayer2 or not targetPlayer2.Character then
    return math.huge
  else
    local character14 = targetPlayer2.Character

    local head2 = character14:FindFirstChild("Head") or character14:FindFirstChild("UpperTorso")
      or character14:FindFirstChild("Torso") or character14:FindFirstChild("HumanoidRootPart")

    if not head2 then
      return math.huge
    else
      local getMouse2 = LocalPlayer:GetMouse()
      local v48, v49 = Camera2:WorldToViewportPoint(head2.Position)

      if not v49 then
        return math.huge
      end

      return (Vector2.new(getMouse2.X, getMouse2.Y) - Vector2.new(v48.X, v48.Y)).Magnitude
    end
  end
end

local function f12()
  local getMouse3 = LocalPlayer:GetMouse()
  local vector2 = Vector2.new(getMouse3.X, getMouse3.Y)
  local huge2 = math.huge
  local players4 = Players
  local v50

  for index18, value38 in ipairs(players4:GetPlayers()) do
    if value38 ~= LocalPlayer and value38.Character then
      local character15 = value38.Character

      local head3 = character15:FindFirstChild("Head")
        or character15:FindFirstChild("UpperTorso") or character15:FindFirstChild("Torso")
        or character15:FindFirstChild("HumanoidRootPart")

      local humanoid11 = character15:FindFirstChildOfClass("Humanoid")
      local bodyEffects8 = character15:FindFirstChild("BodyEffects")

      local kO5 = bodyEffects8

      kO5 = bodyEffects8 and bodyEffects8:FindFirstChild("K.O")
        and bodyEffects8["K.O"].Value == true

      if head3 and humanoid11 and humanoid11.Health > 0 and not kO5 then
        local v51, v52 = Camera2:WorldToViewportPoint(head3.Position)

        if v52 then
          local magnitude6 = (vector2 - Vector2.new(v51.X, v51.Y)).Magnitude

          if magnitude6 < huge2 then
            v50 = value38
            huge2 = magnitude6
          end
        end
      end
    end
  end

  return v50, huge2
end

local function f13()
  if v47.active then
    return
  else
    local v53 = f12()

    if not v53 or not v53.Character then
      Notify("Ragebot: no target", 2)
      return
    else
      local character16 = LocalPlayer.Character
      local humanoidRootPart9 = character16 and character16:FindFirstChild("HumanoidRootPart")

      local humanoid12 = character16
      humanoid12 = character16 and character16:FindFirstChildOfClass("Humanoid")

      local v54 = not humanoidRootPart9
      local v55 = humanoid12

      if v54 or not v55 then
        Notify("Ragebot: character not ready", 2)
        return
      end

      v47.savedCameraSubject = Camera2.CameraSubject
      v47.savedCameraOffset = v55.CameraOffset
      v47.targetPlayer = v53
      v47.active = true

      dynamicAnchor.CFrame = humanoidRootPart9.CFrame
      togglePhysicsRep(true)
      Camera2.CameraSubject = v55
      Notify("Target: " .. v53.DisplayName, 2, v53.UserId)
      return
    end
  end
end

RunService.Heartbeat:Connect(function()
  if not v47.active or v47.frame then
    return
  else
    local v56, v57 = f12()

    if v56 then
      local targetPlayer3 = v47.targetPlayer

      if v56 ~= targetPlayer3 then
        local humanoid13 = targetPlayer3 and targetPlayer3.Character
          and targetPlayer3.Character:FindFirstChildOfClass("Humanoid")

        local v58 = humanoid13 and humanoid13.Health > 0
        local huge3 = v58 and f11(targetPlayer3) or math.huge

        if not v58 or huge3 - v57 > v47.switchThreshold then
          v47.targetPlayer = v56
          Notify("Target: " .. v56.DisplayName, 2, v56.UserId)
        end
      end
    end

    local targetPlayer4 = v47.targetPlayer
    local character17 = targetPlayer4 and targetPlayer4.Character

    local head4 = character17
      and (character17:FindFirstChild("Head") or character17:FindFirstChild("UpperTorso")
        or character17:FindFirstChild("Torso") or character17:FindFirstChild("HumanoidRootPart"))

    local humanoid14 = character17 and character17:FindFirstChildOfClass("Humanoid")
    local bodyEffects9 = character17 and character17:FindFirstChild("BodyEffects")

    local kO6 = bodyEffects9

    kO6 = bodyEffects9 and bodyEffects9:FindFirstChild("K.O")
      and bodyEffects9["K.O"].Value == true

    local v59 = not head4
    local v60 = kO6

    if v59 or not humanoid14 or humanoid14.Health <= 0 or v60 then
      v47.targetPlayer = nil

      if not v56 then
        f9()
      end

      return
    else
      local character18 = LocalPlayer.Character
      local humanoidRootPart10 = character18 and character18:FindFirstChild("HumanoidRootPart")
      local humanoid15 = character18 and character18:FindFirstChildOfClass("Humanoid")

      if not humanoidRootPart10 or not humanoid15 then
        f9()
        return
      else
        v47.targetCFrame = CFrame.new(head4.Position + Vector3.new(0, v47.offsetHeight, 0))
        local cframe2 = humanoidRootPart10.CFrame
        local v61 = cframe2 - cframe2.Position
        local position3 = cframe2.Position
        local position4 = v47.targetCFrame.Position
        local cameraOffset = humanoid15.CameraOffset

        local v62 = {
          root = humanoidRootPart10,
          humanoid = humanoid15,
          oldCFrame = cframe2,
          cameraOffset = cameraOffset,
        }

        v47.frame = v62
        humanoid15.CameraOffset = v61:VectorToObjectSpace(position3 - position4)
        dynamicAnchor.CFrame = cframe2
        humanoidRootPart10.CFrame = CFrame.new(position4) * v61
        local v63 = tick()

        if v63 - v47.lastFire >= v47.fireCooldown then
          v47.lastFire = v63
          f10(v47.targetPlayer)
        end

        RunService.RenderStepped:Wait()

        if v47.frame == v62 then
          if humanoidRootPart10 and humanoidRootPart10.Parent then
            humanoidRootPart10.CFrame = cframe2
          end

          if humanoid15 and humanoid15.Parent then
            humanoid15.CameraOffset = cameraOffset
          end

          v47.frame = nil
        end

        return
      end
    end
  end
end)

UserInputService.InputBegan:Connect(function(input2, p25)
  if p25 then
    return
  end

  if input2.UserInputType == Enum.UserInputType.MouseButton1 and v47.enabled then
    f13()
  end
end)

UserInputService.InputEnded:Connect(function(input3)
  if input3.UserInputType == Enum.UserInputType.MouseButton1 and v47.active then
    f9()
  end
end)

LocalPlayer.CharacterAdded:Connect(function()
  task.defer(function()
    if v47.active then
      f9()
    end

    local character19 = LocalPlayer.Character
    local humanoid16 = character19 and character19:FindFirstChildOfClass("Humanoid")

    if humanoid16 then
      humanoid16.CameraOffset = Vector3.zero
      Camera2.CameraSubject = humanoid16
    end
  end)
end)

Legit:AddToggle("Dynamic", {
  Text = "Ragebot Hold (M1)",
  Default = false,
  KeybindRequiresToggle = false,
  Keybind = Enum.KeyCode.Unknown,
  HoldToggle = false,
  Callback = function(value39)
    v47.enabled = value39

    if value39 then
      f8()
    else
      f9()
      v47.targetPlayer = nil
      f8()
    end
  end,
})

Legit:AddToggle("FastStomp", {
  Text = "Fast Stomp",
  Default = false,
  KeybindRequiresToggle = true,
  Keybind = Enum.KeyCode.Unknown,
  HoldToggle = true,
  Callback = function(value40)
    stompState.enabled = value40

    if value40 then
      runFastStomp()
    elseif not stompState.nearbyEnabled then
      f3()
    end
  end,
})

Legit:AddToggle("AutoStompNearby", {
  Text = "Auto Stomp Nearby",
  Default = false,
  Callback = function(value41)
    stompState.nearbyEnabled = value41

    if value41 then
      runNearbyStompLoop()
    elseif stompState.active and not stompState.enabled then
      f3()
    end
  end,
})

Legit:addTextBox("NearbyStompRange", "15", function(p26)
  local v64 = tonumber(p26)

  if v64 then
    stompState.nearbyRange = v64
  end
end)

Legit:AddToggle("StompVisualizer", {
  Text = "Stomp Visualizer",
  Default = false,
  Callback = function(value42)
    stompState.visual = value42

    if not value42 and visualizerDummy then
      visualizerDummy:Destroy()
      visualizerDummy = nil
    end
  end,
})

getgenv().XZQW_NoSpreadAmount = getgenv().XZQW_NoSpreadAmount or 0

Legit:AddSlider("NoSpreadAmount", {
  Text = "Spread %",
  Min = 0,
  Max = 100,
  Default = 0,
  Rounding = 0,
  Callback = function(value43) getgenv().XZQW_NoSpreadAmount = value43 end,
})

Legit:AddToggle("NoSpread", {
  Text = "No Spread",
  Default = false,
  Callback = function(value44)
    getgenv().XZQW_NoSpread = value44

    if value44 then
      Notify("No Spread Enabled", 2)

      if getgenv()._ns_shootOrig and getgenv()._ns_version ~= "v4-converge" then
        pcall(function()
          local v65 = require(replicatedStorage.Modules.GunHandler)

          if v65 and getgenv()._ns_shootOrig then
            v65.shoot = getgenv()._ns_shootOrig
          end
        end)

        getgenv()._ns_shootOrig = nil
      end

      if not getgenv()._ns_shootOrig then
        local v66, v67 = pcall(function()
          local v68 = require(replicatedStorage.Modules.GunHandler)

          if type(v68) ~= "table" or type(v68.shoot) ~= "function" then
            error("GunHandler.shoot is not a function")
          end

          getgenv()._ns_shootOrig = v68.shoot
          getgenv()._ns_version = "v4-converge"

          local v69 = 0

          local function f14()
            for index19, value45 in ipairs({
              getgenv().SA_state, getgenv().SA, _G and _G.SA, shared and shared.SA,
            }) do
              if type(value45) == "table" and value45.on ~= nil and value45.fov ~= nil then
                return value45
              end
            end

            return nil
          end

          local v70

          function v68.shoot(index20)
            if not getgenv().XZQW_NoSpread then
              return getgenv()._ns_shootOrig(index20)
            else
              local v71 = tonumber(getgenv().XZQW_NoSpreadAmount) or 0

              if v71 >= 100 then
                return getgenv()._ns_shootOrig(index20)
              end

              if type(index20) ~= "table" or not index20.ForcedOrigin or not index20.AimPosition then
                return getgenv()._ns_shootOrig(index20)
              else
                local forcedOrigin = index20.ForcedOrigin
                local unit = nil
                local v72 = f14()

                if v72 and (v72.on or v72.forcePart) then
                  local forcePart2 = v72.forcePart or v72.locked

                  if forcePart2 and forcePart2.Parent then
                    v70 = forcePart2
                    v69 = os.clock()
                  elseif v70 and v70.Parent and os.clock() - v69 < 0.2 then
                    forcePart2 = v70
                  end

                  if forcePart2 and forcePart2.Parent then
                    unit = (forcePart2.Position - forcedOrigin).Unit
                  end
                end

                if not unit then
                  local currentCamera = workspace.CurrentCamera
                  local localPlayer2 = players.LocalPlayer
                  local character20 = localPlayer2 and localPlayer2.Character

                  if not (currentCamera and character20) then
                    return getgenv()._ns_shootOrig(index20)
                  end

                  local getMouse4 = localPlayer2:GetMouse()

                  local screenPointToRay = currentCamera:ScreenPointToRay(
                    getMouse4.X, getMouse4.Y
                  )

                  local raycastParams2 = RaycastParams.new()
                  raycastParams2.FilterType = Enum.RaycastFilterType.Exclude
                  raycastParams2.FilterDescendantsInstances = { character20, currentCamera }
                  raycastParams2.IgnoreWater = true

                  local raycast2 = workspace:Raycast(
                    screenPointToRay.Origin, screenPointToRay.Direction * 2000, raycastParams2
                  )

                  unit = ((raycast2 and raycast2.Position
                      or screenPointToRay.Origin + screenPointToRay.Direction * 2000)
                    - forcedOrigin).Unit

                  if not unit then
                    return getgenv()._ns_shootOrig(index20)
                  end

                  index20.AimPosition = forcedOrigin + unit:Lerp(
                    (index20.AimPosition - forcedOrigin).Unit, v71 / 100
                  ).Unit * 200

                  return getgenv()._ns_shootOrig(index20)
                end

                if not unit then
                  return getgenv()._ns_shootOrig(index20)
                end

                index20.AimPosition = forcedOrigin + unit:Lerp(
                  (index20.AimPosition - forcedOrigin).Unit, v71 / 100
                ).Unit * 200

                return getgenv()._ns_shootOrig(index20)
              end
            end
          end
        end)

        if v66 then
          print("[NoSpread] v4-converge installed — force-converges on SA target")
        else
          warn("[NoSpread] patch failed: " .. tostring(v67))
        end
      else
        print("[NoSpread] v4-converge already installed")
      end
    else
      Notify("No Spread Disabled", 1.5)
    end
  end,
})

rfConn = nil
hfConn = nil
hfLoop = nil

Legit:AddToggle("RapidFireToggle", {
  Text = "Rapid Fire",
  Default = false,
  Tooltip = "Removes shooting cooldown",
  Callback = function(value46)
    if value46 then
      for index21, value47 in ipairs(game:GetDescendants()) do
        if value47:IsA("ValueBase")
          and (value47.Name == "ShootingCooldown" or value47.Name == "ToleranceCooldown") then
          value47.Value = 0
        end
      end

      rfConn = game.DescendantAdded:Connect(function(descendant)
        if descendant:IsA("ValueBase")
          and (descendant.Name == "ShootingCooldown" or descendant.Name == "ToleranceCooldown") then
          descendant.Value = 0
        end
      end)
    elseif rfConn then
      rfConn:Disconnect()
      rfConn = nil
    end
  end,
})

Legit:AddToggle("HyperFireToggle", {
  Text = "Rapid Fire v2",
  Default = false,
  Tooltip = "Zeroes ToleranceCooldown + auto-fire while holding LMB",
  Callback = function(value48)
    if value48 then
      for index22, value49 in ipairs(game:GetDescendants()) do
        if value49:IsA("ValueBase") and value49.Name == "ToleranceCooldown" then
          value49.Value = 0
        end
      end

      hfConn = game.DescendantAdded:Connect(function(descendant2)
        if descendant2:IsA("ValueBase") and descendant2.Name == "ToleranceCooldown" then
          descendant2.Value = 0
        end
      end)

      hfLoop = RunService.RenderStepped:Connect(function()
        if UserInputService:IsMouseButtonPressed(Enum.UserInputType.MouseButton1) then
          local tool3 = LocalPlayer.Character
            and LocalPlayer.Character:FindFirstChildOfClass("Tool")

          if tool3 and tool3:FindFirstChild("Ammo") then
            tool3:Activate()
          end
        end
      end)
    else
      if hfConn then
        hfConn:Disconnect()
        hfConn = nil
      end

      if hfLoop then
        hfLoop:Disconnect()
        hfLoop = nil
      end
    end
  end,
})

Main:AddToggle("VelocityFly", {
  Text = "Velocity Fly",
  Default = false,
  Keybind = Enum.KeyCode.Unknown,
  KeybindRequiresToggle = true,
  KeybindPicker = true,
  Callback = function(value50)
    IsFlying = value50

    if value50 then
      Notify("Velocity Fly Enabled", 2)

      FlyLoop = RunService.Heartbeat:Connect(function()
        local character21 = LocalPlayer.Character

        local humanoidRootPart11 = character21
          and character21:FindFirstChild("HumanoidRootPart")

        local humanoid17 = character21 and character21:FindFirstChildOfClass("Humanoid")

        if not (humanoidRootPart11 and humanoid17) then
          return
        else
          local animate = character21:FindFirstChild("Animate")

          if animate and not animate.Disabled then
            animate.Disabled = true

            for index23, value51 in ipairs(humanoid17:GetPlayingAnimationTracks()) do
              value51:Stop()
            end
          end

          local moveDirection = humanoid17.MoveDirection

          if moveDirection.Magnitude > 0 then
            local cframe3 = Camera2.CFrame
            local vector3 = Vector3.new(cframe3.LookVector.X, 0, cframe3.LookVector.Z)
            local unit2 = vector3.Magnitude > 0 and vector3.Unit or Vector3.new(0, 0, -1)
            local vector4 = Vector3.new(cframe3.RightVector.X, 0, cframe3.RightVector.Z)
            local unit3 = vector4.Magnitude > 0 and vector4.Unit

            local vector5 = unit3
            vector5 = unit3 or Vector3.new(1, 0, 0)

            local v73 = cframe3.LookVector * moveDirection:Dot(unit2)
              + cframe3.RightVector * moveDirection:Dot(vector5)

            humanoidRootPart11.Velocity = v73.Magnitude > 0 and v73.Unit * FlySpeed
              or Vector3.zero
          else
            humanoidRootPart11.Velocity = Vector3.zero
          end

          return
        end
      end)
    else
      Notify("Velocity Fly Disabled", 1.5)

      if FlyLoop then
        FlyLoop:Disconnect()
        FlyLoop = nil
      end

      local character22 = LocalPlayer.Character

      if character22 then
        local animate2 = character22:FindFirstChild("Animate")

        if animate2 then
          animate2.Disabled = false
        end

        local humanoid18 = character22:FindFirstChildOfClass("Humanoid")

        if humanoid18 then
          humanoid18:ChangeState(Enum.HumanoidStateType.Standing)
        end
      end
    end
  end,
})

Main:AddSlider("VelocityFlySpeed", {
  Text = "Velocity Fly Speed",
  Min = 200,
  Max = 800,
  Default = 200,
  Rounding = 0,
  Callback = function(value52) FlySpeed = tonumber(value52) end,
})

Main:AddToggle("CFrameSpeed", {
  Text = "CFrame Speed",
  Default = false,
  Keybind = Enum.KeyCode.Unknown,
  KeybindRequiresToggle = true,
  Callback = function(value53)
    IsCFrameActive = value53

    if value53 then
      Notify("CFrame Fly Enabled", 2)

      CFrameLoop = RunService.Heartbeat:Connect(function()
        local character23 = LocalPlayer.Character

        local humanoidRootPart12 = character23
          and character23:FindFirstChild("HumanoidRootPart")

        local humanoid19 = character23 and character23:FindFirstChildWhichIsA("Humanoid")
        local animator = humanoid19 and humanoid19:FindFirstChild("Animator")

        if not (humanoidRootPart12 and animator) then
          return
        else
          local moveDirection2 = humanoid19.MoveDirection

          if moveDirection2.Magnitude > 0 then
            local hoverTrack = HoverTrack

            character23:SetPrimaryPartCFrame(humanoidRootPart12.CFrame
              + moveDirection2.Unit * CFrameSpeed)

            if not (hoverTrack and HoverTrack.IsPlaying) then
              if FlyTrack then
                FlyTrack:Stop()
              end

              HoverTrack = animator:LoadAnimation(HoverAnimation)
              HoverTrack:Play()
            end
          elseif not (FlyTrack and FlyTrack.IsPlaying) then
            if HoverTrack then
              HoverTrack:Stop()
            end

            FlyTrack = animator:LoadAnimation(FlyAnimation)
            FlyTrack:Play()
          end

          return
        end
      end)
    else
      Notify("CFrame Fly Disabled", 1.5)

      if CFrameLoop then
        CFrameLoop:Disconnect()
        CFrameLoop = nil
      end

      if FlyTrack then
        FlyTrack:Stop()
      end

      if HoverTrack then
        HoverTrack:Stop()
      end
    end
  end,
})

Main:AddSlider("CFrameFlySpeed", {
  Text = "CFrame Fly Speed",
  Min = 1,
  Max = 100,
  Default = 1,
  Rounding = 0,
  Callback = function(value54) CFrameSpeed = tonumber(value54) end,
})

Main:AddToggle("WalkspeedLoop", {
  Text = "Walkspeed Loop",
  Default = false,
  Keybind = Enum.KeyCode.Unknown,
  KeybindRequiresToggle = true,
  Callback = function(value55)
    WalkSpeedEnabled = value55

    if value55 then
      Notify("Walkspeed Loop Active", 2)

      WalkSpeedConnection = RunService.RenderStepped:Connect(function()
        local humanoid20 = LocalPlayer.Character
          and LocalPlayer.Character:FindFirstChildOfClass("Humanoid")

        if humanoid20 then
          humanoid20.WalkSpeed = WalkSpeedValue
        end
      end)
    else
      Notify("Walkspeed Reset", 1.5)

      if WalkSpeedConnection then
        WalkSpeedConnection:Disconnect()
        WalkSpeedConnection = nil
      end

      local character24 = LocalPlayer.Character

      local humanoid21 = character24
      humanoid21 = character24 and LocalPlayer.Character:FindFirstChildOfClass("Humanoid")

      if humanoid21 then
        humanoid21.WalkSpeed = 16
      end
    end
  end,
})

Main:AddSlider("WalkspeedAmount", {
  Text = "Walkspeed Amount",
  Min = 40,
  Max = 1000,
  Default = 40,
  Rounding = 0,
  Callback = function(value56) WalkSpeedValue = tonumber(value56) end,
})

LocalPlayer.CharacterAdded:Connect(function()
  IsFlying = false
  IsCFrameActive = false
  WalkSpeedEnabled = false

  if FlyTrack then
    FlyTrack:Stop()
  end

  if HoverTrack then
    HoverTrack:Stop()
  end

  if FlyLoop then
    FlyLoop:Disconnect()
    FlyLoop = nil
  end

  if CFrameLoop then
    CFrameLoop:Disconnect()
    CFrameLoop = nil
  end

  if WalkSpeedConnection then
    WalkSpeedConnection:Disconnect()
    WalkSpeedConnection = nil
  end
end)

Main:AddToggle("EnableDesync", {
  Text = "Enable Desync",
  Default = false,
  Keybind = Enum.KeyCode.Unknown,
  Callback = function(value57) toggleDesync(value57) end,
})

Main:AddDropdown("DesyncMethod", {
  Text = "Desync Method",
  Values = { "Destroy Cheaters", "Underground", "Jitter", "Unkillable", "Simple Blink" },
  Default = "Unkillable",
  MultiSelect = false,
  Callback = function(value58)
    desync.mode = value58

    if desync.enabled then
      Notify("Mode Swapped: " .. value58, 2)
    end
  end,
})

SavedSpawnCFrame = nil
SpawnConnection = nil

function HandleRespawn(p27)
  if SavedSpawnCFrame then
    local waitForChild4 = p27:WaitForChild("HumanoidRootPart", 5)

    if waitForChild4 then
      task.wait(0.1)
      waitForChild4.CFrame = SavedSpawnCFrame
      Notify("Teleported to Saved Spawn Point!", 2)
    end
  end
end

_G.CLONE_GRAB_ENABLED = false
_G.CLONE_STARTING = false
_G.CLONE_LIVE_CONNECTIONS = {}
_G.CLONE_PLAYER_CLONE = nil
_G.CLONE_STOP = nil
_G.CLONE_CONTROL = nil
_G.CLONE_THING = nil
_G.CLONE_UNGRABBED = nil

if _G.ACTIVE_GRAB_PARTS then
  for index24, value59 in ipairs(_G.ACTIVE_GRAB_PARTS) do
    local v74 = value59
    pcall(function() v74:Destroy() end)
  end
end

_G.ACTIVE_GRAB_PARTS = {}
_G.ACTIVE_GRAB_SINE = false

local function f15()
  _G.ACTIVE_GRAB_SINE = false

  if _G.ACTIVE_GRAB_PARTS then
    for index25, value60 in ipairs(_G.ACTIVE_GRAB_PARTS) do
      local v75 = value60
      pcall(function() v75:Destroy() end)
    end
  end

  _G.ACTIVE_GRAB_PARTS = {}

  if _G.CLONE_CONTROL then
    pcall(function() _G.CLONE_CONTROL:Disconnect() end)
    _G.CLONE_CONTROL = nil
  end

  if _G.CLONE_THING then
    pcall(function() _G.CLONE_THING:Disconnect() end)
    _G.CLONE_THING = nil
  end

  if _G.CLONE_UNGRABBED then
    pcall(function() _G.CLONE_UNGRABBED:Disconnect() end)
    _G.CLONE_UNGRABBED = nil
  end

  _G.CLONE_GRAB_ENABLED = false
end

local function makeAttachment(upperTorso5, p28, vector6, vector7)
  local instance = Instance.new("Attachment", upperTorso5)
  local instance2 = Instance.new("Attachment", p28)
  local instance3 = Instance.new("AlignPosition", upperTorso5)
  local instance4 = Instance.new("AlignOrientation", upperTorso5)
  instance2.Position = vector6
  instance.Rotation = vector7

  instance3.RigidityEnabled = true
  instance3.Responsiveness = 200
  instance3.Attachment0 = instance
  instance3.Attachment1 = instance2

  instance4.MaxTorque = 9000000000
  instance4.Responsiveness = 200
  instance4.RigidityEnabled = true
  instance4.Attachment0 = instance
  instance4.Attachment1 = instance2

  return instance, instance2, instance3, instance4
end

Main:addButton("Troll Grenade", function()
  if _G.TrollGrenadeCleanup then
    _G.TrollGrenadeCleanup = nil
  end

  local v76 = {
    Height = 3,
    Speed = 4,
    SteerResponse = 14,
    SteerMin = 50,
    SteerMax = 350,
    GrenadeName = "[Grenade]",
  }

  local v77 = {
    Connections = {},
    Grenades = {},
    Target = nil,
    Active = false,
    Formation = nil,
    ActiveToken = nil,
    StartedAt = 0,
  }

  local function f16(p29, p30)
    local connect = p29:Connect(p30)
    table.insert(v77.Connections, connect)
    return connect
  end

  local function f17()
    local character25 = LocalPlayer.Character
    return character25 and character25:FindFirstChild("HumanoidRootPart")
  end

  local function f18(p31, p32)
    local v78 = p32 - p31.Position
    local magnitude7 = v78.Magnitude

    if magnitude7 > 0.01 then
      p31.AssemblyLinearVelocity = v78.Unit * math.clamp(
        magnitude7 * v76.SteerResponse, v76.SteerMin, v76.SteerMax
      )
    end
  end

  local v79 = {}

  v79.Tornado = {
    Desc = "Rising vortex funnel",
    Pos = function(index26, index27, p33, p34)
      local v80 = (p33 - 1) / math.max(1, p34 - 1)
      local v81 = v80 * math.pi * 4 + index27 * (2 + v80 * 4)
      local v82 = 2 + v80 * 9

      return (index26.CFrame * CFrame.new(
        math.cos(v81) * v82, v80 * 14 - 4 + v76.Height, math.sin(v81) * v82
      )).Position
    end,
  }

  v79.Galaxy = {
    Desc = "Two-arm spiral galaxy",
    Pos = function(index28, index29, p35, p36)
      local pi = p35 % 2 == 0 and 0 or math.pi
      local v83 = (p35 - 1) / math.max(1, p36 - 1)
      local v84 = v83 * 11
      local v85 = v83 * math.pi * 3 + index29 * 1.5 + pi
      local v86 = math.sin(v83 * 3)

      return (index28.CFrame
        * CFrame.new(math.cos(v85) * v84, v86 * 2 + v76.Height, math.sin(v85) * v84)).Position
    end,
  }

  v79.Heart = {
    Desc = "Heart shape",
    Pos = function(index30, p37, index31, index32)
      local v87 = index31 / index32 * math.pi * 2
      local v88 = math.sin(v87)
      local v89 = math.cos(v87)
      local v90 = math.cos(2 * v87)
      local v91 = math.cos(3 * v87)
      local v92 = math.cos(4 * v87)

      return (index30.CFrame * CFrame.new(
        16 * v88 ^ 3 * 0.55, (13 * v89 - 5 * v90 - 2 * v91 - v92) * 0.55 + 6, 0
      )).Position
    end,
  }

  v79.DNA = {
    Desc = "Double helix strand",
    Pos = function(index33, index34, p38, p39)
      local pi2 = p38 % 2 == 0 and 0 or math.pi
      local v93 = (p38 - 1) / math.max(1, p39 - 1)
      local v94 = v93 * math.pi * 4 + index34 * 2 + pi2

      return (index33.CFrame * CFrame.new(
        math.cos(v94) * 6, (v93 - 0.5) * 16 + v76.Height, math.sin(v94) * 6
      )).Position
    end,
  }

  v79.Spiral = {
    Desc = "Vertical corkscrew",
    Pos = function(index35, index36, p40, p41)
      local v95 = (p40 - 1) / math.max(1, p41 - 1)
      local v96 = v95 * math.pi * 6 + index36 * 2

      return (index35.CFrame * CFrame.new(
        math.cos(v96) * 8, (v95 - 0.5) * 14 + v76.Height, math.sin(v96) * 8
      )).Position
    end,
  }

  v79.Saturn = {
    Desc = "Tilted ring with core",
    Pos = function(index37, index38, index39, index40)
      local v97 = math.floor(index40 * 0.7)

      if index39 <= v97 then
        local v98 = (index39 - 1) / v97 * math.pi * 2 + index38
        local v99 = math.cos(v98)
        local v100 = math.sin(v98) * 11
        local v101 = math.rad(30)
        local v102 = math.sin(v101)
        local v103 = math.cos(v101)

        return (index37.CFrame
          * CFrame.new(v99 * 11, v100 * v102 + v76.Height, v100 * v103)).Position
      else
        local v104 = index39 - v97
        local v105 = math.max(1, index40 - v97)
        local v106 = math.acos(1 - 2 * (v104 - 0.5) / v105)
        local v107 = math.pi * 3.2360679774998 * v104 + index38

        local vector8 = Vector3.new(
          math.cos(v107) * math.sin(v106), math.cos(v106), math.sin(v107) * math.sin(v106)
        )

        return (index37.CFrame
          * CFrame.new(vector8.X * 3, vector8.Y * 3 + v76.Height, vector8.Z * 3)).Position
      end
    end,
  }

  v79.Star = {
    Desc = "Five-point star",
    Pos = function(index41, index42, index43, index44)
      local v108 = index43 / index44 * math.pi * 2 + index42 * 0.5
      local v109 = 3 + 8 * math.abs(math.sin(2.5 * v108))

      return (index41.CFrame
        * CFrame.new(math.cos(v108) * v109, math.sin(v108) * v109 + 6, 0)).Position
    end,
  }

  v79.Lissajous = {
    Desc = "3D figure-8 curve",
    Pos = function(index45, index46, index47, index48)
      local v110 = index47 / index48 * math.pi * 2 + index46
      local v111 = math.sin(v110 * 2)
      local v112 = math.sin(v110 * 3)
      local v113 = math.cos(v110)
      return (index45.CFrame * CFrame.new(v111 * 8, v112 * 4 + v76.Height, v113 * 5)).Position
    end,
  }

  v79.Infinity = {
    Desc = "Infinity symbol",
    Pos = function(index49, index50, index51, index52)
      local v114 = index51 / index52 * math.pi * 2 + index50
      local v115 = math.cos(v114)
      local v116 = math.sin(v114)
      local v117 = math.sin(v114)
      local v118 = math.cos(v114)
      local v119 = math.sin(v114)

      return (index49.CFrame * CFrame.new(
        v115 / (1 + v116 ^ 2) * 9, v76.Height, v117 * v118 / (1 + v119 ^ 2) * 9
      )).Position
    end,
  }

  v79.Sphere = {
    Desc = "Fibonacci sphere bubble",
    Pos = function(index53, index54, index55, p42)
      local v120 = math.acos(1 - 2 * (index55 - 0.5) / p42)
      local v121 = math.pi * 3.2360679774998 * index55 + index54

      local vector9 = Vector3.new(
        math.cos(v121) * math.sin(v120), math.cos(v120), math.sin(v121) * math.sin(v120)
      )

      return (index53.CFrame
        * CFrame.new(vector9.X * 8, vector9.Y * 8 + v76.Height, vector9.Z * 8)).Position
    end,
  }

  v79.Triangle = {
    Desc = "Triangle outline",
    Pos = function(index56, p43, index57, index58)
      local vector10 = Vector2.new(-5, -3)
      local vector11 = Vector2.new(5, -3)
      local vector12 = Vector2.new(0, 6)
      local magnitude8 = (vector11 - vector10).Magnitude
      local magnitude9 = (vector12 - vector11).Magnitude
      local magnitude10 = (vector10 - vector12).Magnitude

      local v122 = (index57 - 1) / math.max(1, index58)
        * (magnitude8 + magnitude9 + magnitude10)

      local lerp

      if v122 < magnitude8 then
        lerp = vector10:Lerp(vector11, v122 / magnitude8)
      elseif v122 < magnitude8 + magnitude9 then
        lerp = vector11:Lerp(vector12, (v122 - magnitude8) / magnitude9)
      else
        lerp = vector12:Lerp(vector10, (v122 - magnitude8 - magnitude9) / magnitude10)
      end

      return (index56.CFrame * CFrame.new(lerp.X, lerp.Y + 5, 0)).Position
    end,
  }

  v79.Spread = {
    Desc = "Box grid beneath you, then drop",
    ReleaseAfter = 1.5,
    Pos = function(index59, p44, index60, p45)
      local v123 = math.max(2, math.ceil(math.sqrt(p45)))
      local v124 = v123 - 1
      local v125 = (v123 - 1) / 2
      local v126 = {}

      for k = 0, v124 do
        for m = 0, v123 - 1 do
          if k == 0 or k == v123 - 1 or m == 0 or m == v123 - 1 then
            table.insert(v126, { k, m })
          end
        end
      end

      local v127 = v126[(index60 - 1) % #v126 + 1]

      return (index59.CFrame
        * CFrame.new((v127[2] - v125) * 5, -3, (v127[1] - v125) * 5)).Position
    end,
  }

  local function f19()
    f16(RunService.Heartbeat, function()
      if not v77.Active or not v77.Formation then
        return
      end

      local v128 = f17()

      if not v128 then
        return
      end

      if v77.Target then
        v77.Target.Position = (v128.CFrame * CFrame.new(0, v76.Height, 0)).Position
      end

      local v129 = #v77.Grenades
      local v130

      if v129 == 0 then
        return
      else
        v130 = os.clock() * v76.Speed
        local v131 = os.clock() - v77.StartedAt
        local releaseAfter = v77.Formation.ReleaseAfter and v131 > v77.Formation.ReleaseAfter

        for n = v129, 1, -1 do
          local v132 = n
          local v133 = v77.Grenades[v132]

          if v133 and v133.Parent then
            if not releaseAfter then
              pcall(function() f18(v133, v77.Formation.Pos(v128, v130, v132, v129)) end)
            end
          else
            table.remove(v77.Grenades, v132)
          end
        end

        return
      end
    end)
  end

  local function f20()
    local ignored2 = workspace:FindFirstChild("Ignored")

    if not ignored2 then
      warn("[Troll Grenade] workspace.Ignored not found")
      return false
    end

    f16(ignored2.ChildAdded, function(p46)
      if not v77.Active then
        return
      end

      if not (p46:IsA("BasePart") and p46.Name == "Handle") then
        return
      end

      task.spawn(function()
        task.wait()

        if not v77.Active or not p46.Parent then
          return
        end

        if table.find(v77.Grenades, p46) then
          return
        end

        table.insert(v77.Grenades, p46)

        p46.Destroying:Connect(function()
          local v134 = table.find(v77.Grenades, p46)

          if v134 then
            table.remove(v77.Grenades, v134)
          end
        end)
      end)
    end)

    return true
  end

  local function f21()
    table.clear(v77.Grenades)
    local backpack = LocalPlayer:FindFirstChild("Backpack")
    local character26 = LocalPlayer.Character or LocalPlayer.CharacterAdded:Wait()

    if not backpack or not character26 then
      return
    else
      local v135 = {}

      for index61, value61 in ipairs(backpack:GetChildren()) do
        if value61:IsA("Tool") and value61.Name == v76.GrenadeName then
          value61.Parent = character26
          v135[#v135 + 1] = value61
        end
      end

      if #v135 == 0 then
        warn("[Troll Grenade] No " .. v76.GrenadeName .. " tools found")
        return
      end

      task.wait(0.2)

      for index62, value62 in ipairs(v135) do
        local v136 = value62

        if v136.Parent then
          pcall(function() v136:Activate() end)
        end
      end

      task.wait(0.4)

      for index63, value63 in ipairs(v135) do
        local v137 = value63

        if v137.Parent then
          pcall(function() v137:Activate() end)
        end
      end

      print(("[Troll Grenade] Threw %d grenades"):format(#v135))
      return
    end
  end

  local function f22()
    v77.Active = false
    v77.Formation = nil
    v77.ActiveToken = nil

    table.clear(v77.Grenades)

    if v77.Target then
      pcall(function() v77.Target:Destroy() end)
      v77.Target = nil
    end
  end

  local function makePart(formation)
    if v77.Active then
      return
    end

    v77.Active = true
    v77.Formation = formation
    v77.StartedAt = os.clock()

    table.clear(v77.Grenades)

    v77.Target = Instance.new("Part")
    v77.Target.Name = "GrenadeFormationTarget"
    v77.Target.Size = Vector3.new(1, 1, 1)
    v77.Target.Transparency = 1
    v77.Target.Anchored = true
    v77.Target.CanCollide = false
    v77.Target.CanTouch = false
    v77.Target.CanQuery = false
    v77.Target.Parent = workspace

    if not f20() then
      f22()
      return
    end

    f19()
  end

  local function f23(p47)
    for index64, value64 in ipairs({
      LocalPlayer:FindFirstChild("Backpack"), LocalPlayer.Character,
    }) do
      if value64 then
        for index65, value65 in ipairs(value64:GetChildren()) do
          if value65:IsA("Tool") and value65.Name == p47 then
            value65:Destroy()
          end
        end
      end
    end
  end

  local function makeTool(p48, value66)
    f23(p48)

    local tool4 = Instance.new("Tool")
    tool4.Name = p48
    tool4.RequiresHandle = true
    tool4.CanBeDropped = false
    tool4.ToolTip = value66.Desc or p48

    local handle = Instance.new("Part")
    handle.Name = "Handle"
    handle.Size = Vector3.new(0.5, 0.5, 0.5)
    handle.Transparency = 1
    handle.CanCollide = false
    handle.Massless = true
    handle.Parent = tool4

    tool4.Parent = LocalPlayer:WaitForChild("Backpack")
    local v138 = {}

    tool4.Activated:Connect(function()
      f22()
      v77.ActiveToken = v138
      makePart(value66)
      f21()
    end)

    tool4.Unequipped:Connect(function()
      if v77.ActiveToken == v138 then
        f22()
      end
    end)

    return tool4
  end

  local v139 = {}

  local function f24()
    for index66, value67 in ipairs(v139) do
    end

    table.clear(v139)

    for key4, value68 in pairs(v79) do
      table.insert(v139, makeTool("Grenade " .. key4, value68))
    end

    print(("[Troll Grenade] %d tools added to backpack."):format(#v139))
  end

  f24()

  if not _G.TrollGrenadeRespawnConn then
    _G.TrollGrenadeRespawnConn = LocalPlayer.CharacterAdded:Connect(function() task.wait(1) end)
  end

  _G.TrollGrenadeCreateAll = f24

  function _G.TrollGrenadeCleanup()
    f22()

    for index67, value69 in ipairs(v139) do
    end
  end
end)

Main:addButton("Thug Grab", function()
  local localPlayer3 = players.LocalPlayer
  local character27 = localPlayer3.Character
  local anim = replicatedStorage.IM.ANIM
  local players5 = workspace.Players

  if _G.JOINTWATCHER then
    _G.JOINTWATCHER:Disconnect()
    _G.JOINTWATCHER = nil
  end

  f15()

  _G.JOINTWATCHER = players5.DescendantAdded:Connect(function(descendant3)
    local weld = descendant3:IsA("Weld") and descendant3.Name == "GRABBING_CONSTRAINT"
    local v140, v141, v142, v143

    if weld then
      while true do
        task.wait()

        if descendant3.Part0 ~= nil then
          break
        end
      end

      while true do
        task.wait()

        if descendant3:FindFirstChildOfClass("RopeConstraint") then
          break
        end
      end

      v140 = nil
      v141 = nil
      v142 = nil
      v143 = nil

      if descendant3.Part0:IsDescendantOf(localPlayer3.Character) then
        descendant3:FindFirstChildOfClass("RopeConstraint").Length = 9000000000
        character27.Animate.Disabled = true

        for key5, value70 in pairs(character27.Humanoid:GetPlayingAnimationTracks()) do
          value70:Stop()
        end

        character27.Animate.Disabled = false
        character27.Humanoid:LoadAnimation(anim.RightAim):Play()
        character27.Humanoid:LoadAnimation(anim.LeftAim):Play()

        local v144, v145, v146

        v140, v146, v145, v144 = makeAttachment(
          descendant3.Parent.UpperTorso, localPlayer3.Character.UpperTorso,
          Vector3.new(0, 0, 10), Vector3.new(90, 545, 0)
        )

        v141 = v146
        v142 = v145
        v143 = v144

        _G.ACTIVE_GRAB_PARTS = { v140, v141, v142, v143 }
        _G.ACTIVE_GRAB_SINE = true

        task.spawn(function()
          while descendant3.Parent and _G.ACTIVE_GRAB_SINE do
            task.wait()
            local v147 = tick()
            v141.Position = Vector3.new(0, -1.2, -4 + 1 * math.sin(v147 * 60 / 8))
          end
        end)
      end

      while true do
        task.wait()

        if descendant3.Parent == nil then
          break
        end
      end

      character27.Animate.Disabled = true

      for key6, value71 in pairs(character27.Humanoid:GetPlayingAnimationTracks()) do
        value71:Stop()
      end

      character27.Animate.Disabled = false

      if v140 then
        pcall(function() v140:Destroy() end)
      end

      if v141 then
        pcall(function() v141:Destroy() end)
      end

      if v142 then
        pcall(function() v142:Destroy() end)
      end

      if v143 then
        pcall(function() v143:Destroy() end)
      end

      _G.ACTIVE_GRAB_PARTS = {}
    end
  end)
end)

Main:addButton("Puppet Grab", function()
  local localPlayer4 = players.LocalPlayer
  local character28 = localPlayer4.Character
  local anim2 = replicatedStorage.IM.ANIM
  local players6 = workspace.Players

  if _G.JOINTWATCHER then
    _G.JOINTWATCHER:Disconnect()
    _G.JOINTWATCHER = nil
  end

  f15()

  _G.JOINTWATCHER = players6.DescendantAdded:Connect(function(descendant4)
    local weld2 = descendant4:IsA("Weld") and descendant4.Name == "GRABBING_CONSTRAINT"
    local v148, v149, v150, v151

    if weld2 then
      while true do
        task.wait()

        if descendant4.Part0 ~= nil then
          break
        end
      end

      while true do
        task.wait()

        if descendant4:FindFirstChildOfClass("RopeConstraint") then
          break
        end
      end

      v148 = nil
      v149 = nil
      v150 = nil
      v151 = nil

      if descendant4.Part0:IsDescendantOf(localPlayer4.Character) then
        descendant4:FindFirstChildOfClass("RopeConstraint").Length = 9000000000
        character28.Animate.Disabled = true

        for key7, value72 in pairs(character28.Humanoid:GetPlayingAnimationTracks()) do
          value72:Stop()
        end

        character28.Animate.Disabled = false
        character28.Humanoid:LoadAnimation(anim2.RightAim):Play()

        local v152, v153, v154, v155 = makeAttachment(
          descendant4.Parent.UpperTorso, localPlayer4.Character.RightHand, Vector3.new(0, 0, 0),
          Vector3.new(90, 0, 0)
        )

        v148 = v152
        v149 = v153
        v150 = v154
        v151 = v155
        _G.ACTIVE_GRAB_PARTS = { v148, v149, v150, v151 }
      end

      while true do
        task.wait()

        if descendant4.Parent == nil then
          break
        end
      end

      character28.Animate.Disabled = true

      for key8, value73 in pairs(character28.Humanoid:GetPlayingAnimationTracks()) do
        value73:Stop()
      end

      character28.Animate.Disabled = false

      if v148 then
        pcall(function() v148:Destroy() end)
      end

      if v149 then
        pcall(function() v149:Destroy() end)
      end

      if v150 then
        pcall(function() v150:Destroy() end)
      end

      if v151 then
        pcall(function() v151:Destroy() end)
      end

      _G.ACTIVE_GRAB_PARTS = {}
    end
  end)
end)

Main:addButton("NeckGrab", function()
  local localPlayer5 = players.LocalPlayer
  local character29 = localPlayer5.Character
  local anim3 = replicatedStorage.IM.ANIM
  local players7 = workspace.Players

  if _G.JOINTWATCHER then
    _G.JOINTWATCHER:Disconnect()
    _G.JOINTWATCHER = nil
  end

  f15()

  _G.JOINTWATCHER = players7.DescendantAdded:Connect(function(descendant5)
    local weld3 = descendant5:IsA("Weld") and descendant5.Name == "GRABBING_CONSTRAINT"
    local v156, v157, v158, v159

    if weld3 then
      while true do
        task.wait()

        if descendant5.Part0 ~= nil then
          break
        end
      end

      while true do
        task.wait()

        if descendant5:FindFirstChildOfClass("RopeConstraint") then
          break
        end
      end

      v156 = nil
      v157 = nil
      v158 = nil
      v159 = nil

      if descendant5.Part0:IsDescendantOf(localPlayer5.Character) then
        descendant5:FindFirstChildOfClass("RopeConstraint").Length = 9000000000
        character29.Animate.Disabled = true

        for key9, value74 in pairs(character29.Humanoid:GetPlayingAnimationTracks()) do
          value74:Stop()
        end

        character29.Animate.Disabled = false
        character29.Humanoid:LoadAnimation(anim3.RightAim):Play()

        local v160, v161, v162, v163 = makeAttachment(
          descendant5.Parent.UpperTorso, localPlayer5.Character.RightHand, Vector3.new(0, 0, 0),
          Vector3.new(90, 0, 160)
        )

        v156 = v160
        v157 = v161
        v158 = v162
        v159 = v163
        _G.ACTIVE_GRAB_PARTS = { v156, v157, v158, v159 }
      end

      while true do
        task.wait()

        if descendant5.Parent == nil then
          break
        end
      end

      character29.Animate.Disabled = true

      for key10, value75 in pairs(character29.Humanoid:GetPlayingAnimationTracks()) do
        value75:Stop()
      end

      character29.Animate.Disabled = false

      if v156 then
        pcall(function() v156:Destroy() end)
      end

      if v157 then
        pcall(function() v157:Destroy() end)
      end

      if v158 then
        pcall(function() v158:Destroy() end)
      end

      if v159 then
        pcall(function() v159:Destroy() end)
      end

      _G.ACTIVE_GRAB_PARTS = {}
    end
  end)
end)

Main:addButton("Kiss", function()
  local localPlayer6 = players.LocalPlayer
  local character30 = localPlayer6.Character
  local anim4 = replicatedStorage.IM.ANIM
  local players8 = workspace.Players

  if _G.JOINTWATCHER then
    _G.JOINTWATCHER:Disconnect()
    _G.JOINTWATCHER = nil
  end

  f15()

  _G.JOINTWATCHER = players8.DescendantAdded:Connect(function(descendant6)
    local weld4 = descendant6:IsA("Weld") and descendant6.Name == "GRABBING_CONSTRAINT"
    local v164, v165, v166, v167

    if weld4 then
      while true do
        task.wait()

        if descendant6.Part0 ~= nil then
          break
        end
      end

      while true do
        task.wait()

        if descendant6:FindFirstChildOfClass("RopeConstraint") then
          break
        end
      end

      v164 = nil
      v165 = nil
      v166 = nil
      v167 = nil

      if descendant6.Part0:IsDescendantOf(localPlayer6.Character) then
        descendant6:FindFirstChildOfClass("RopeConstraint").Length = 9000000000
        character30.Animate.Disabled = true

        for key11, value76 in pairs(character30.Humanoid:GetPlayingAnimationTracks()) do
          value76:Stop()
        end

        character30.Animate.Disabled = false
        character30.Humanoid:LoadAnimation(anim4.RightAim):Play()
        character30.Humanoid:LoadAnimation(anim4.LeftAim):Play()

        local v168, v169, v170, v171 = makeAttachment(
          descendant6.Parent.UpperTorso, localPlayer6.Character.UpperTorso,
          Vector3.new(0, 0, 2), Vector3.new(20, 180, 0)
        )

        v164 = v168
        v165 = v169
        v166 = v170
        v167 = v171

        _G.ACTIVE_GRAB_PARTS = { v164, v165, v166, v167 }
        _G.ACTIVE_GRAB_SINE = true

        spawn(function()
          while descendant6.Parent ~= nil and _G.ACTIVE_GRAB_SINE do
            task.wait()
            local v172 = tick()
            v165.Position = Vector3.new(0, 0.5, -1.7 + 0.4 * math.sin(v172 * 60 / 9))
          end
        end)
      end

      while true do
        task.wait()

        if descendant6.Parent == nil then
          break
        end
      end

      character30.Animate.Disabled = true

      for key12, value77 in pairs(character30.Humanoid:GetPlayingAnimationTracks()) do
        value77:Stop()
      end

      character30.Animate.Disabled = false

      if v164 then
        pcall(function() v164:Destroy() end)
      end

      if v165 then
        pcall(function() v165:Destroy() end)
      end

      if v166 then
        pcall(function() v166:Destroy() end)
      end

      if v167 then
        pcall(function() v167:Destroy() end)
      end

      _G.ACTIVE_GRAB_PARTS = {}
    end
  end)
end)

Main:addButton("Save Spawn Point", function()
  local humanoidRootPart13 = LocalPlayer.Character
    and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

  if humanoidRootPart13 then
    SavedSpawnCFrame = humanoidRootPart13.CFrame

    if not SpawnConnection then
      SpawnConnection = LocalPlayer.CharacterAdded:Connect(HandleRespawn)
    end

    Notify("Spawn Point Saved Successfully!", 2)
  else
    Notify("Error: HumanoidRootPart not found.", 2)
  end
end)

Main:addButton("Remove Spawn Point", function()
  if SavedSpawnCFrame or SpawnConnection then
    SavedSpawnCFrame = nil

    if SpawnConnection then
      SpawnConnection:Disconnect()
      SpawnConnection = nil
    end

    Notify("Saved Spawn Point Removed", 1.5)
  else
    Notify("No spawn point was active.", 1.5)
  end
end)

Main:addButton("Animation Pack", function()
  loadstring(game:HttpGet("https://raw.githubusercontent.com/Vcsk/RobloxScripts/main/DaHood/AnimationPack.lua"))()
end)

Main:addButton("Rejoin", function() teleportService:Teleport(game.PlaceId, LocalPlayer) end)

MinPlayers = 0
MaxPlayers = 999

Main:addTextBox("Min Players", "0", function(p49) MinPlayers = tonumber(p49) or 0 end)
Main:addTextBox("Max Players", "999", function(p50) MaxPlayers = tonumber(p50) or 999 end)

Main:addButton("Server Hop", function()
  local v173, v174 = pcall(function()
    return game:HttpGet("https://games.roblox.com/v1/games/" .. game.PlaceId
      .. "/servers/Public?sortOrder=Desc&limit=100")
  end)

  if not v173 then
    Notify("Failed to get servers", 2)
    return
  else
    local playing = -1
    local v175 = nil

    for index68, value78 in ipairs(httpService:JSONDecode(v174).data or {}) do
      if value78.id ~= game.JobId and value78.playing < value78.maxPlayers
        and value78.playing >= MinPlayers and value78.playing <= MaxPlayers then
        if value78.playing > playing then
          playing = value78.playing
          v175 = value78
        end
      end
    end

    if v175 then
      Notify("Joining server: " .. v175.playing .. " players", 2)
      teleportService:TeleportToPlaceInstance(game.PlaceId, v175.id, LocalPlayer)
    else
      Notify("No server found: " .. MinPlayers .. "-" .. MaxPlayers .. " players", 2)
    end

    return
  end
end)

csync_gun = workspace:FindFirstChild("Csync_Setback")

if not csync_gun then
  csync_gun = Instance.new("Part")
  csync_gun.Name = "Csync_Setback"
  csync_gun.Size = Vector3.new(2, 2, 1)
  csync_gun.Anchored = true
  csync_gun.CanCollide = false
  csync_gun.Transparency = 1
  csync_gun.Parent = workspace
end

csync = {
  enabled = false,
  tpPos = nil,
  old = nil,
  mode = "Default",
  target = nil,
}

csyncBuying = false

function setCsync(p51)
  if csyncBuying or not p51 or not p51:FindFirstChild("Head") then
    return
  else
    csyncBuying = true

    csync.enabled = true
    csync.tpPos = p51.Head.Position - Vector3.new(0, 2, 0)
    csync.target = p51

    local enabled = desync and desync.enabled

    if enabled then
      toggleDesync(false)
    end

    task.wait(0.15)
    local clickDetector = p51:FindFirstChildOfClass("ClickDetector")

    if clickDetector then
      for i6 = 1, 12 do
        fireclickdetector(clickDetector)
        task.wait(0.015)
      end
    end

    task.wait(0.1)
    csync.enabled = false
    resetcam()

    if enabled then
      toggleDesync(true)
    end

    csyncBuying = false
    return
  end
end

RunService.Heartbeat:Connect(function()
  if not csync.enabled or not csync.tpPos or not csync.target then
    return
  else
    local character31 = LocalPlayer.Character
    local humanoidRootPart14 = character31 and character31:FindFirstChild("HumanoidRootPart")
    local humanoid22 = character31 and character31:FindFirstChild("Humanoid")

    if not humanoidRootPart14 or not humanoid22 then
      return
    end

    csync.old = humanoidRootPart14.CFrame

    if csync.mode == "Default" then
      local v176 = csync.old - csync.old.Position
      local tpPos = csync.tpPos
      humanoid22.CameraOffset = v176:VectorToObjectSpace(csync.old.Position - tpPos)
      humanoidRootPart14.CFrame = CFrame.new(tpPos) * v176
      RunService.RenderStepped:Wait()
      humanoidRootPart14.CFrame = csync.old
      humanoid22.CameraOffset = Vector3.zero
    end

    return
  end
end)

for index69, value79 in ipairs({
  { name = "Revolver", kw = "[Revolver]" }, { name = "Flintlock", kw = "[Flintlock]" },
  { name = "LMG", kw = "[LMG]" }, { name = "TacticalShotgun", kw = "[TacticalShotgun]" },
  { name = "DoubleBarrel", kw = "[Double-Barrel SG]" }, { name = "AK47", kw = "[AK47]" },
  { name = "Flamethrower", kw = "[Flamethrower]" }, { name = "AUG", kw = "[AUG]" },
  { name = "Rifle", kw = "[Rifle]" }, { name = "RPG", kw = "[RPG]" },
  { name = "DrumGun", kw = "[DrumGun]" },
}) do
  local name = value79.name
  local kw = value79.kw
  local gsub = kw:gsub("]$", " Ammo]")

  Guns:AddButton("Buy " .. name .. " | Ammo", function()
    local v177 = findShopItem(kw)
    local v178 = findShopItem(gsub)

    if not v177 then
      Notify("Shop item not found: " .. name, 2)
      return
    end

    if (LocalPlayer.Backpack:FindFirstChild(kw) or LocalPlayer.Character:FindFirstChild(kw))
      and v178 then
      Notify("Purchasing Ammo for " .. name, 2)
      setCsync(v178)
    else
      Notify("Purchasing Weapon: " .. name, 2)
      setCsync(v177)
    end
  end)
end

for index70, value80 in ipairs({
  { name = "Hamburger", kw = "[Hamburger]" }, { name = "FireArmor", kw = "[Fire Armor]" },
  { name = "HighMediumArmor", kw = "[High-Medium Armor]" },
  { name = "Grenade", kw = "[Grenade]" },
}) do
  local v179 = value80

  Guns:AddButton("Buy " .. v179.name, function()
    local v180 = findShopItem(v179.kw)

    if not v180 then
      Notify("Shop item not found: " .. v179.name, 2)
      return
    end

    Notify("Purchasing " .. v179.name, 2)
    setCsync(v180)
  end)
end

armorState = {
  shop = findShopItem("[High-Medium Armor]"),
  autoEnabled = false,
  threshold = 100,
  isBuying = false,
  csync = false,
  tpPos = nil,
  old = nil,
}

armor_dummy = workspace:FindFirstChild("Csync_Armor_Setback")

if not armor_dummy then
  armor_dummy = Instance.new("Part")
  armor_dummy.Name = "Csync_Armor_Setback"
  armor_dummy.Size = Vector3.new(2, 2, 1)
  armor_dummy.Anchored = true
  armor_dummy.CanCollide = false
  armor_dummy.Transparency = 1
  armor_dummy.Parent = workspace
end

RunService.Heartbeat:Connect(function()
  if not armorState.csync or not armorState.tpPos then
    return
  else
    local character32 = LocalPlayer.Character
    local humanoidRootPart15 = character32 and character32:FindFirstChild("HumanoidRootPart")
    local humanoid23 = character32 and character32:FindFirstChild("Humanoid")

    if not humanoidRootPart15 or not humanoid23 then
      return
    else
      armorState.old = humanoidRootPart15.CFrame
      local v181 = armorState.old - armorState.old.Position
      local tpPos2 = armorState.tpPos
      humanoid23.CameraOffset = v181:VectorToObjectSpace(armorState.old.Position - tpPos2)
      humanoidRootPart15.CFrame = CFrame.new(tpPos2) * v181
      RunService.RenderStepped:Wait()
      humanoidRootPart15.CFrame = armorState.old
      humanoid23.CameraOffset = Vector3.zero
      return
    end
  end
end)

LocalPlayer.CharacterAdded:Connect(function()
  armorState.csync = false
  armorState.tpPos = nil
  armorState.old = nil
  armorState.isBuying = false

  resetcam()
end)

task.spawn(function()
  while task.wait(0.1) do
    if armorState.autoEnabled and not armorState.isBuying and not armorState.csync then
      if not armorState.shop or not armorState.shop.Parent then
        armorState.shop = findShopItem("[High-Medium Armor]")
      end

      if armorState.shop then
        local character33 = LocalPlayer.Character
        local bodyEffects10 = character33 and character33:FindFirstChild("BodyEffects")
        local armor = bodyEffects10 and bodyEffects10:FindFirstChild("Armor")

        if armor then
          if (tonumber(armor.Value) or 100) <= (tonumber(armorState.threshold) or 135) then
            Notify("Armor Low", 2)
            armorState.isBuying = true

            if character33 and character33:FindFirstChild("HumanoidRootPart") then
              local enabled2 = desync and desync.enabled

              if enabled2 then
                toggleDesync(false)
              end

              armorState.tpPos = armorState.shop.Head.Position - Vector3.new(0, 2, 0)
              armorState.csync = true

              task.wait(0.15)
              local clickDetector2 = armorState.shop:FindFirstChildOfClass("ClickDetector")

              if clickDetector2 then
                for i7 = 1, 12 do
                  fireclickdetector(clickDetector2)
                  task.wait(0.015)
                end
              end

              task.wait(0.1)

              armorState.csync = false
              armorState.tpPos = nil
              armorState.old = nil

              resetcam()

              if enabled2 then
                toggleDesync(true)
              end
            end

            armorState.isBuying = false
          end
        end
      end
    end
  end
end)

Misc:AddToggle("AutoArmor", {
  Text = "Auto Armor",
  Default = false,
  Callback = function(value81)
    armorState.autoEnabled = value81

    if value81 then
      Notify("Auto Armor Enabled", 2)
    else
      armorState.csync = false
      armorState.tpPos = nil
      armorState.old = nil
      armorState.isBuying = false

      resetcam()
      Notify("Auto Armor Disabled", 1.5)
    end
  end,
})

Misc:AddSlider("ArmorThreshold", {
  Text = "Armor Threshold",
  Default = 100,
  Min = 100,
  Max = 135,
  Rounding = 0,
  Callback = function(value82) armorState.threshold = value82 end,
})

auraSettings = {
  range = 300,
  whitelist = {},
  enabled = false,
  active = false,
}

Misc:AddToggle("KillAura", {
  Text = "Kill Aura (Detected)",
  Default = false,
  Keybind = Enum.KeyCode.Unknown,
  KeybindRequiresToggle = true,
  Callback = function(value83)
    auraSettings.enabled = value83
    auraSettings.active = value83

    if value83 then
      Notify("Kill Aura Activated", 2)

      task.spawn(function()
        while auraSettings.enabled do
          local character34 = LocalPlayer.Character

          if auraSettings.active and character34
            and character34:FindFirstChild("HumanoidRootPart") then
            local huge4 = math.huge
            local v182 = nil

            for index71, value84 in ipairs(Players:GetPlayers()) do
              if value84 ~= LocalPlayer and not auraSettings.whitelist[value84.Name]
                and value84.Character and value84.Character:FindFirstChild("Head")
                and not value84.Character:FindFirstChild("GRABBING_CONSTRAINT") then
                local bodyEffects11 = value84.Character:FindFirstChild("BodyEffects")

                local kO7 = bodyEffects11
                kO7 = bodyEffects11 and bodyEffects11:FindFirstChild("K.O")

                if kO7 and not kO7.Value then
                  local magnitude11 = (character34.HumanoidRootPart.Position
                    - value84.Character.Head.Position).Magnitude

                  if magnitude11 < huge4 and magnitude11 <= auraSettings.range then
                    huge4 = magnitude11
                    v182 = value84
                  end
                end
              end
            end

            if v182 and v182.Character and v182.Character:FindFirstChild("Head") then
              for index72, value85 in ipairs(character34:GetChildren()) do
                if value85:IsA("Tool") and value85:FindFirstChild("Handle")
                  and value85:FindFirstChild("Ammo") then
                  ReplicatedStorage.MainEvent:FireServer(
                    "ShootGun", value85.Handle, value85.Handle.CFrame.Position,
                    v182.Character.Head.Position, v182.Character.Head, Vector3.new(0, 0, -1)
                  )
                end
              end
            end
          end

          task.wait()
        end
      end)
    else
      Notify("Kill Aura Disabled", 1.5)
      auraSettings.active = false
    end
  end,
})

Misc:AddSlider("KillAuraRange", {
  Text = "Kill Aura Range",
  Default = 300,
  Min = 10,
  Max = 300,
  Rounding = 0,
  Callback = function(value86) auraSettings.range = tonumber(value86) end,
})

Misc:addTextBox("WhitelistPlayer", "", function(p52)
  if p52 == "" then
    return
  else
    local v183 = false
    local v184 = string.lower(p52)

    for index73, value87 in ipairs(Players:GetPlayers()) do
      if string.find(string.lower(value87.Name), v184)
        or string.find(string.lower(value87.DisplayName), v184) then
        v183 = true

        if auraSettings.whitelist[value87.Name] then
          auraSettings.whitelist[value87.Name] = nil
          Notify(value87.Name .. " removed from kill aura whitelist.", 3)
        else
          auraSettings.whitelist[value87.Name] = true
          Notify(value87.Name .. " added to kill aura whitelist.", 3)
        end

        break
      end
    end

    if not v183 then
      Notify("No matching player found.", 2)
    end

    return
  end
end)

noclipConnection = nil
CASH_AURA_ENABLED = false
CASH_AURA_RANGE = 17

Misc:AddToggle("AutoFarmToggle", {
  Text = "Atm Farm",
  Default = false,
  Callback = function(value88)
    getgenv().On = value88

    if value88 then
      Notify("Auto Farm Enabled", 2)

      if not getgenv().FarmLoaded then
        getgenv().FarmLoaded = true
        loadstring(game:HttpGet("https://raw.githubusercontent.com/Omyghoodnes221/Private/refs/heads/main/Auto%20Farm"))()
      end
    else
      Notify("Auto Farm Disabled", 1.5)
    end
  end,
})

Misc:AddToggle("InfiniteZoom", {
  Text = "Inf Zoom",
  Default = false,
  Callback = function(value89)
    local localPlayer7 = players.LocalPlayer

    if value89 then
      localPlayer7.CameraMinZoomDistance = 0.5
      localPlayer7.CameraMaxZoomDistance = 100000
    else
      localPlayer7.CameraMinZoomDistance = 0.5
      localPlayer7.CameraMaxZoomDistance = 128
    end
  end,
})

Misc:AddToggle("CameraNoclip", {
  Text = "Camera Noclip",
  Default = false,
  Callback = function(value90)
    local localPlayer8 = players.LocalPlayer

    localPlayer8.DevCameraOcclusionMode = value90 and Enum.DevCameraOcclusionMode.Invisicam
      or Enum.DevCameraOcclusionMode.Zoom
  end,
})

Misc:AddToggle("ResetOnBagged", {
  Text = "Reset on Bagged",
  Default = false,
  Callback = function(value91)
    local g = _G
    g.BagConn = _G.BagConn and _G.BagConn:Disconnect()

    if value91 then
      Notify("Reset on Bagged Enabled", 2)

      local function f25(character35)
        if character35:FindFirstChild("Christmas_Sock") then
          local humanoid24 = character35:FindFirstChildOfClass("Humanoid")

          if humanoid24 then
            humanoid24.Health = 0
          end
        end

        _G.BagConn = character35.ChildAdded:Connect(function(child)
          if child.Name == "Christmas_Sock" then
            local humanoid25 = character35:FindFirstChildOfClass("Humanoid")

            if humanoid25 then
              humanoid25.Health = 0
            end
          end
        end)
      end

      if LocalPlayer.Character then
        f25(LocalPlayer.Character)
      end

      LocalPlayer.CharacterAdded:Connect(f25)
    else
      Notify("Reset on Bagged Disabled", 1.5)
    end
  end,
})

ffGui = nil
ffConn = nil

Misc:AddToggle("RespawnAbuse", {
  Text = "Respawn Abuse",
  Default = false,
  Callback = function(value92)
    if ffGui then
      ffGui:Destroy()
      ffGui = nil
    end

    if ffConn then
      ffConn:Disconnect()
      ffConn = nil
    end

    local instance5

    if value92 then
      Notify("FF Reset Enabled", 2)
      local localPlayer9 = LocalPlayer

      local ffTimer = Instance.new("ScreenGui", localPlayer9:WaitForChild("PlayerGui"))
      ffTimer.Name = "FF timer"
      ffTimer.ResetOnSpawn = false

      ffGui = ffTimer
      local instance6 = Instance.new("Frame", ffTimer)
      local udim = UDim2.new(0, 140, 0, 28)
      local udim2 = UDim2.new(0.5, -70, 0.85, 0)

      instance6.Size = udim
      instance6.Position = udim2
      instance6.BackgroundColor3 = Color3.fromRGB(25, 25, 25)
      instance6.BorderSizePixel = 0
      instance6.Active = true
      instance6.Draggable = true

      Instance.new("UICorner", instance6).CornerRadius = UDim.new(0, 5)
      instance5 = Instance.new("TextLabel", instance6)
      local udim3 = UDim2.new(1, 0, 1, 0)
      local color4 = Color3.new(1, 1, 1)
      local sourceSansBold = Enum.Font.SourceSansBold

      instance5.Size = udim3
      instance5.BackgroundTransparency = 1
      instance5.TextColor3 = color4
      instance5.TextSize = 13

      local function f26(p53)
        local waitForChild5 = p53:WaitForChild("Humanoid", 3)
        local waitForChild6 = p53:WaitForChild("ForceField", 3)
        local v185 = waitForChild6 and waitForChild5
        local v186, connect2

        if v185 then
          v186 = tick()

          task.spawn(function()
            while waitForChild6.Parent == p53 and ffGui do
              local v187 = math.max(0, 9.8 - (tick() - v186))
              instance5.Text = string.format("FF Ends: %.1fs", v187)

              if v187 <= 0 then
                if waitForChild5.Health > 0 then
                  waitForChild5.Health = 0
                end

                break
              end

              task.wait(0.05)
            end
          end)

          connect2 = nil

          connect2 = p53.ChildRemoved:Connect(function(child2)
            if child2 == waitForChild6 and ffGui then
              connect2:Disconnect()

              if waitForChild5.Health > 0 then
                waitForChild5.Health = 0
              end
            end
          end)
        elseif waitForChild5 and waitForChild5.Health > 0 then
          waitForChild5.Health = 0
        end
      end

      instance5.Font = sourceSansBold

      if LocalPlayer.Character then
        task.spawn(f26, LocalPlayer.Character)
      end

      ffConn = LocalPlayer.CharacterAdded:Connect(f26)
    else
      Notify("FF Reset Disabled", 1.5)
    end
  end,
})

Misc:AddToggle("GodBlock", {
  Text = "God Block",
  Default = false,
  Callback = function(value93)
    getgenv().XZQW_GodBlock = value93
    local localPlayer10, tool5

    if value93 == true then
      if not getgenv().AUTO_BLOCK__ then
        replicatedStorage.MainEvent:FireServer("ResetNew")
        players.LocalPlayer.Character.Humanoid:ChangeState("Dead")
      end

      local v188 = game
      v188:GetService("ReplicatedStorage").ClientAnimations.Block.AnimationId = "rbxassetid://0"

      if not getgenv()._gb_canShootOrig then
        local v189, v190 = pcall(function()
          local v191 = require(replicatedStorage.Modules.GunHandler)

          if type(v191) ~= "table" or type(v191.getCanShoot) ~= "function" then
            error("GunHandler.getCanShoot is not a function")
          end

          getgenv()._gb_canShootOrig = v191.getCanShoot

          function v191.getCanShoot(p54)
            if getgenv().XZQW_GodBlock then
              return true
            end

            return getgenv()._gb_canShootOrig(p54)
          end
        end)

        if v189 then
          print("[GodBlock] ✓ getCanShoot patched — shooting while blocked enabled")
        else
          warn("[GodBlock] ⚠ Your executor does not support patching getCanShoot (or the module is missing).")
          warn("[GodBlock]   Reason: " .. tostring(v190))
          warn("[GodBlock]   → Continuing — GodBlock will work, but you will NOT be able to shoot while blocked.")
        end
      end

      if not getgenv()._gb_wsHooked then
        local v192, v193 = pcall(function()
          if type(getrawmetatable) ~= "function" then
            error("getrawmetatable is missing")
          end

          if type(setreadonly) ~= "function" then
            error("setreadonly is missing")
          end

          if type(newcclosure) ~= "function" then
            error("newcclosure is missing")
          end

          local v194 = getrawmetatable(game)
          local newindex = v194.__newindex
          setreadonly(v194, false)

          v194.__newindex = newcclosure(function(p55, p56, p57)
            if p56 == "WalkSpeed" and typeof(p57) == "number" and getgenv().XZQW_GodBlock
              and p57 < 16 then
              return newindex(p55, p56, 16)
            end

            return newindex(p55, p56, p57)
          end)

          setreadonly(v194, true)
        end)

        if v192 then
          getgenv()._gb_wsHooked = true
          print("[GodBlock] ✓ WalkSpeed clamp installed — no slowdown (smooth)")
        else
          warn("[GodBlock] ⚠ Your executor does not support metatable hooks.")
          warn("[GodBlock]   Reason: " .. tostring(v193))
          warn("[GodBlock]   → Continuing — NoSlow will still work via Stepped fallback (may have tiny 1-frame dips).")
        end
      end

      localPlayer10 = players.LocalPlayer
      tool5 = nil
      task.wait()

      function Block()
        replicatedStorage.MainEvent:FireServer("Block", true)
        wait()
        replicatedStorage.MainEvent:FireServer("Block", false)
      end

      if getgenv().AUTO_BLOCK__ then
        getgenv().AUTO_BLOCK__:Disconnect()
      end

      local v195 = getgenv()

      v195.AUTO_BLOCK__ = runService.Stepped:Connect(function()
        if blocking == true then
          local character36 = localPlayer10.Character

          if not character36 then
            return
          end

          local bodyEffects12 = character36:FindFirstChild("BodyEffects")

          if bodyEffects12 and bodyEffects12:FindFirstChild("Block") then
            bodyEffects12.Block:Destroy()
          end

          local humanoid26 = character36:FindFirstChildOfClass("Humanoid")

          if humanoid26 and humanoid26.WalkSpeed < 16 then
            humanoid26.WalkSpeed = 16
          end

          tool5 = character36:FindFirstChildWhichIsA("Tool")

          if tool5 then
            if tool5:FindFirstChild("GunScript") then
              replicatedStorage.MainEvent:FireServer("Block", true)
            else
              Block()
            end
          else
            Block()
          end

          return
        end
      end)

      blocking = true
      task.wait()
    elseif value93 == false then
      blocking = false
      getgenv().XZQW_GodBlock = false
    end
  end,
})

local v196 = getgenv()
v196.YRWL_NoSlowConn___ = getgenv().YRWL_NoSlowConn___ or {}

Misc:AddToggle("NoSlow", {
  Text = "No Slow",
  Default = false,
  Callback = function(value94)
    getgenv().XZQW_NoSlow = value94

    if value94 then
      Notify("No Slow Enabled", 2)

      if not getgenv()._ns_wsHooked then
        local v197, v198 = pcall(function()
          local v199 = getrawmetatable(game)
          local newindex2 = v199.__newindex
          setreadonly(v199, false)

          v199.__newindex = newcclosure(function(p58, p59, p60)
            if p59 == "WalkSpeed" and typeof(p60) == "number" and getgenv().XZQW_NoSlow
              and p60 < 16 then
              return newindex2(p58, p59, 16)
            end

            return newindex2(p58, p59, p60)
          end)

          setreadonly(v199, true)
        end)

        if v197 then
          getgenv()._ns_wsHooked = true
          print("[NoSlow] WalkSpeed clamp installed (min 16)")
        else
          warn("[NoSlow] __newindex hook unavailable, using Stepped fallback only: "
            .. tostring(v198))
        end
      end

      local v200 = getgenv()
      local stepped = RunService.Stepped

      table.insert(v200.YRWL_NoSlowConn___, stepped:Connect(function()
        if not getgenv().XZQW_NoSlow then
          return
        else
          local character37 = LocalPlayer.Character

          if not character37 then
            return
          else
            local humanoid27 = character37:FindFirstChildOfClass("Humanoid")

            if not humanoid27 then
              return
            end

            if humanoid27.WalkSpeed < 16 then
              humanoid27.WalkSpeed = 16
            end

            return
          end
        end
      end))
    else
      Notify("No Slow Disabled", 1.5)

      for index74, value95 in ipairs(getgenv().YRWL_NoSlowConn___) do
        if value95 then
          value95:Disconnect()
        end
      end

      table.clear(getgenv().YRWL_NoSlowConn___)
    end
  end,
})

Misc:AddToggle("AutoBlock", {
  Text = "Auto Block",
  Default = false,
  Callback = function(value96)
    getgenv().XZQW_AutoBlock = value96

    if value96 then
      Notify("Auto Block Enabled", 2)

      RunService:BindToRenderStep("Auto-Block", 0, function()
        if not getgenv().XZQW_AutoBlock then
          return
        else
          local v201 = {
            "[Popcorn]", "[HotDog]", "[GrenadeLauncher]", "[RPG]", "[SMG]", "[TacticalShotgun]",
            "[AK47]", "[AUG]", "[Glock]", "[Shotgun]", "[Flamethrower]", "[Silencer]", "[AR]",
            "[Revolver]", "[SilencerAR]", "[LMG]", "[P90]", "[DrumGun]", "[Double-Barrel SG]",
            "[Hamburger]", "[Chicken]", "[Pizza]", "[Cranberry]", "[Donut]", "[Taco]",
            "[Starblox Latte]", "[BrownBag]", "[Weights]", "[HeavyWeights]",
          }

          if workspace:FindFirstChild("Players") then
            for key13, value97 in pairs(workspace.Players:GetChildren()) do
              if value97:FindFirstChild("UpperTorso") and value97:FindFirstChild("BodyEffects") then
                local character38 = LocalPlayer.Character

                if character38 and character38:FindFirstChild("HumanoidRootPart") then
                  if (value97.UpperTorso.Position
                      - character38.HumanoidRootPart.Position).Magnitude
                    <= 15 then
                    local tool6 = value97:FindFirstChildWhichIsA("Tool")

                    if value97.BodyEffects.Attacking.Value == true and tool6
                      and not table.find(v201, tool6.Name) and value97.Name ~= LocalPlayer.Name then
                      ReplicatedStorage.MainEvent:FireServer("Block", LocalPlayer.Name)
                    end
                  end
                end
              end
            end
          end

          return
        end
      end)
    else
      Notify("Auto Block Disabled", 1.5)
      RunService:UnbindFromRenderStep("Auto-Block")
    end
  end,
})

Misc:AddToggle("CashAura", {
  Text = "Cash Aura",
  Default = false,
  Callback = function(value98)
    CASH_AURA_ENABLED = value98

    if value98 then
      Notify("Cash Aura Enabled", 2)

      task.spawn(function()
        while CASH_AURA_ENABLED do
          local drop = workspace:FindFirstChild("Ignored")
            and workspace.Ignored:FindFirstChild("Drop")

          if drop then
            local humanoidRootPart16 = LocalPlayer.Character
              and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

            for key14, value99 in pairs(drop:GetChildren()) do
              if value99.Name == "MoneyDrop" and humanoidRootPart16 then
                if ((value99:GetAttribute("OriginalPos") or value99.Position)
                    - humanoidRootPart16.Position).Magnitude
                  <= CASH_AURA_RANGE then
                  local clickDetector3 = value99:FindFirstChildOfClass("ClickDetector")

                  if clickDetector3 then
                    fireclickdetector(clickDetector3)
                  end
                end
              end
            end
          end

          task.wait(0.2)
        end
      end)
    else
      Notify("Cash Aura Disabled", 1.5)
    end
  end,
})

getgenv().ShootAnimationIds = {
  ["rbxassetid://2807049953"] = true,
  ["rbxassetid://2809413000"] = true,
  ["rbxassetid://2809419094"] = true,
  ["rbxassetid://507768375"] = true,
  ["rbxassetid://507755388"] = true,
  ["rbxassetid://2877910736"] = true,
}

Misc:AddToggle("RemoveShootAnimation", {
  Text = "Remove Shoot Animation",
  Default = false,
  Callback = function(value100)
    getgenv().RemoveShootAnimationsEnabled = value100
    local f27, f28

    if value100 then
      Notify("Shoot Animations Removed", 2)

      function f27(p61)
        local humanoid28 = p61:FindFirstChildOfClass("Humanoid")

        if humanoid28 then
          for index75, value101 in ipairs(humanoid28:GetPlayingAnimationTracks()) do
            if getgenv().ShootAnimationIds[value101.Animation.AnimationId] then
              value101:Stop()
            end
          end
        end
      end

      function f28(p62)
        f27(p62)

        p62.DescendantAdded:Connect(function(descendant7)
          if descendant7:IsA("AnimationTrack") and getgenv().RemoveShootAnimationsEnabled
            and getgenv().ShootAnimationIds[descendant7.Animation.AnimationId] then
            descendant7:Stop()
          end
        end)
      end

      for index76, value102 in ipairs(Players:GetPlayers()) do
        if value102.Character then
          f28(value102.Character)
        end

        value102.CharacterAdded:Connect(f28)
      end

      Players.PlayerAdded:Connect(function(player2) player2.CharacterAdded:Connect(f28) end)
    else
      Notify("Shoot Animations Restored", 1.5)
    end
  end,
})

Misc:AddToggle("AntiStomp", {
  Text = "Anti Stomp",
  Default = false,
  Callback = function(value103)
    if value103 then
      Notify("Anti Stomp Active", 2)

      local function f29()
        local character39 = LocalPlayer.Character
        local humanoid29 = character39 and character39:FindFirstChildOfClass("Humanoid")

        if humanoid29 and humanoid29.Health <= 15 then
          for index77, value104 in ipairs({
            "Head", "RightHand", "LeftHand", "LowerTorso", "UpperTorso", "LeftLowerLeg",
            "RightLowerLeg", "RightFoot", "LeftFoot", "LeftUpperLeg", "RightUpperLeg",
            "RightUpperArm", "RightLowerArm", "LeftLowerArm", "LeftUpperArm",
          }) do
            local findFirstChild3 = character39:FindFirstChild(value104)

            if findFirstChild3 then
              findFirstChild3:Destroy()
            end
          end
        end
      end

      f29()

      RunService:BindToRenderStep("Anti-Stomp", Enum.RenderPriority.Camera.Value + 1, f29)
    else
      Notify("Anti Stomp Disabled", 1.5)
      RunService:UnbindFromRenderStep("Anti-Stomp")
    end
  end,
})

getgenv().antiGrabEnabled = false

Misc:AddToggle("AntiGrab", {
  Text = "Anti Grab",
  Default = false,
  Callback = function(value105)
    getgenv().antiGrabEnabled = value105

    if value105 then
      Notify("Anti Grab Enabled", 2)

      task.spawn(function()
        local renderStepped = RunService.RenderStepped
        local connect3

        connect3 = renderStepped:Connect(function()
          if not getgenv().antiGrabEnabled then
            if connect3 then
              connect3:Disconnect()
            end

 
            return
          else
            local character40 = LocalPlayer.Character

            if not character40 then
              return
            else
              local humanoid30 = character40:FindFirstChildOfClass("Humanoid")

              if humanoid30 and character40:FindFirstChild("GRABBING_CONSTRAINT") then
                humanoid30:ChangeState(Enum.HumanoidStateType.Physics)
                task.wait()
                humanoid30:ChangeState(Enum.HumanoidStateType.GettingUp)
                task.wait()
                humanoid30:ChangeState(Enum.HumanoidStateType.Running)
              end

              return
            end
          end
        end)
      end)
    else
      Notify("Anti Grab Disabled", 1.5)
    end
  end,
})

Misc:AddToggle("Noclip", {
  Text = "Noclip",
  Default = false,
  Callback = function(value106)
    if value106 then
      Notify("Noclip Enabled", 2)

      noclipConnection = RunService.Stepped:Connect(function()
        local character41 = LocalPlayer.Character

        if character41 then
          for key15, value107 in pairs(character41:GetDescendants()) do
            if value107:IsA("BasePart") then
              value107.CanCollide = false
            end
          end
        end
      end)
    else
      Notify("Noclip Disabled", 1.5)

      if noclipConnection then
        noclipConnection:Disconnect()
        noclipConnection = nil
      end

      local character42 = LocalPlayer.Character

      if character42 then
        for key16, value108 in pairs(character42:GetDescendants()) do
          if value108:IsA("BasePart") then
            value108.CanCollide = true
          end
        end
      end
    end
  end,
})

autoReloadEnabled = false

Misc:AddToggle("AutoReload", {
  Text = "Auto Reload",
  Default = false,
  Callback = function(value109)
    autoReloadEnabled = value109

    if value109 then
      Notify("Auto Reload Active", 2)

      task.spawn(function()
        while autoReloadEnabled do
          local character43 = LocalPlayer.Character

          if character43 then
            for key17, value110 in pairs(character43:GetChildren()) do
              if value110:IsA("Tool") and value110:FindFirstChild("Ammo") then
                if value110.Ammo.Value
                  <= (({ ["[Flintlock]"] = 0, ["[Rifle]"] = 1 })[value110.Name] or 1) then
                  ReplicatedStorage.MainEvent:FireServer("Reload", value110)
                  task.wait(3.7)
                end
              end
            end
          end

          task.wait()
        end
      end)
    else
      Notify("Auto Reload Disabled", 1.5)
    end
  end,
})

AntiRPGDesyncLoop = nil

Misc:AddToggle("AntiRPGDesync", {
  Text = "Anti RPG Desync",
  Default = false,
  Callback = function(value111)
    if value111 then
      Notify("Anti RPG Activated", 2)

      if AntiRPGDesyncLoop then
        return
      end

      AntiRPGDesyncLoop = RunService.PostSimulation:Connect(function()
        local character44 = LocalPlayer.Character

        local humanoidRootPart17 = character44
          and character44:FindFirstChild("HumanoidRootPart")

        local humanoid31 = character44 and character44:FindFirstChild("Humanoid")

        if not humanoidRootPart17 or not humanoid31 then
          return
        end

        if workspace:FindFirstChild("Ignored") and workspace.Ignored:FindFirstChild("Model")
          and workspace.Ignored.Model:FindFirstChild("Launcher") then
          local vector13 = Vector3.new(
            math.random(-100, 100), math.random(50, 150), math.random(-100, 100)
          )

          humanoid31.CameraOffset = -vector13
          local cframe4 = humanoidRootPart17.CFrame
          humanoidRootPart17.CFrame = CFrame.new(humanoidRootPart17.Position + vector13)
          RunService.RenderStepped:Wait()
          humanoidRootPart17.CFrame = cframe4
        end
      end)

      return
    end

    Notify("Anti RPG Deactivated", 1.5)

    if AntiRPGDesyncLoop then
      AntiRPGDesyncLoop:Disconnect()
      AntiRPGDesyncLoop = nil
    end
  end,
})

Misc:AddToggle("VelocityDesync", {
  Text = "Velocity Desync",
  Default = false,
  Callback = function(value112)
    local v202 = value112

    local v203 = {
      Velocity = Vector3.new(),
      AssemblyLinear = Vector3.new(),
      Rot = Vector3.new(),
    }

    local connect4

    if value112 then
      Notify("Velocity Desync Enabled", 2)

      task.spawn(function()
        local character45 = LocalPlayer.Character or LocalPlayer.CharacterAdded:Wait()

        local rootPart = (character45:FindFirstChildOfClass("Humanoid")
            or character45:WaitForChild("Humanoid", 60)).RootPart
          or character45:WaitForChild("HumanoidRootPart", 60)

        task.spawn(function()
          while v202 do
            math.randomseed(tick())
            task.wait(1)
          end
        end)

        connect4 = RunService.Heartbeat:Connect(function()
          if not v202 or not rootPart then
            return
          end

          v203.Velocity = rootPart.Velocity
          v203.Rot = rootPart.RotVelocity
          v203.AssemblyLinear = rootPart.AssemblyLinearVelocity

          rootPart.RotVelocity = Vector3.new(
            math.random(-16384, 16384), math.random(-16384, 16384), math.random(-16384, 16384)
          )

          rootPart.Velocity = Vector3.new(
            math.random(-16384, 16384), math.random(-16384, 16384), math.random(-16384, 16384)
          )

          rootPart.AssemblyLinearVelocity = Vector3.new(
            math.random(-16384, 16384), math.random(-16384, 16384), math.random(-16384, 16384)
          )

          RunService.PreRender:Wait()

          if rootPart then
            rootPart.RotVelocity = v203.Rot
            rootPart.Velocity = v203.Velocity
            rootPart.AssemblyLinearVelocity = v203.AssemblyLinear
          end
        end)
      end)
    else
      Notify("Velocity Desync Disabled", 1.5)
      v202 = false

      if connect4 then
        connect4:Disconnect()
      end
    end
  end,
})

Misc:AddToggle("SilentPunch", {
  Text = "Silent Punch",
  Default = false,
  Callback = function(value113)
    if value113 then
      Notify("Silent Punch Active", 2)
      local v204 = getgenv()

      v204.SilentPunchConnection = RunService.RenderStepped:Connect(function()
        local humanoid32 = LocalPlayer.Character
          and LocalPlayer.Character:FindFirstChild("Humanoid")

        if humanoid32 then
          for key18, value114 in pairs(humanoid32:GetPlayingAnimationTracks()) do
            local animationId = value114.Animation.AnimationId
            local match = animationId:match("2788309317")
            local v205 = match

            if not match then
              local match2 = animationId:match("2788309982")
              local v206 = match2

              if not match2 then
                local match3 = animationId:match("3354699999")

                local match4 = match3 or animationId:match("2788289281")
                  or animationId:match("2788292075") or animationId:match("3355740058")
                  or animationId:match("2788311138") or animationId:match("3354696735")
                  or animationId:match("2788290270") or animationId:match("2788305271")
                  or animationId:match("2788308661")

                v206 = match4
              end

              v205 = v206
            end

            if v205 then
              value114:Stop()
            end
          end
        end
      end)
    else
      Notify("Silent Punch Disabled", 1.5)

      if getgenv().SilentPunchConnection then
        getgenv().SilentPunchConnection:Disconnect()
        getgenv().SilentPunchConnection = nil
      end
    end
  end,
})

autobox = false
boxingConnection = nil
oldposboxing = nil

Misc:AddToggle("BoxingFarm", {
  Text = "Boxing Farm",
  Default = false,
  Callback = function(value115)
    autobox = value115

    if value115 then
      Notify("Boxing Farm Enabled", 2)
      local combat = LocalPlayer.Backpack:FindFirstChild("Combat")

      if combat then
        combat.Parent = LocalPlayer.Character
      end

      if LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart") then
        oldposboxing = LocalPlayer.Character.HumanoidRootPart.Position
      end

      boxingConnection = RunService.Heartbeat:Connect(function()
        if not autobox then
          return
        else
          local character46 = LocalPlayer.Character

          if character46 and character46:FindFirstChild("HumanoidRootPart") then
            character46.HumanoidRootPart.CFrame = CFrame.new(
              -279.363251, 22.5704575, -1142.79883, -0.629518926, -4.21714468e-8, -0.776985168,
              -6.35824335e-8, 1, -2.76080292e-9, 0.776985168, 4.76646278e-8, -0.629518926
            )

            local combat2 = character46:FindFirstChild("Combat")

            if combat2 then
              combat2:Activate()
              task.wait()
              combat2:Deactivate()
            end
          end

          return
        end
      end)
    else
      Notify("Boxing Farm Disabled", 1.5)
      autobox = false

      if boxingConnection then
        boxingConnection:Disconnect()
        boxingConnection = nil
      end

      local character47 = LocalPlayer.Character

      if oldposboxing and character47 and character47:FindFirstChild("HumanoidRootPart") then
        character47.HumanoidRootPart.CFrame = CFrame.new(oldposboxing)
      end
    end
  end,
})

isAutoWeightActive = false

function equipItem(p63)
  local character48 = LocalPlayer.Character or LocalPlayer.CharacterAdded:Wait()
  local findFirstChild4 = LocalPlayer.Backpack:FindFirstChild(p63)

  if findFirstChild4 then
    findFirstChild4.Parent = character48
    task.wait(0.1)
    local humanoid33 = character48:FindFirstChildOfClass("Humanoid")

    if humanoid33 then
      humanoid33:EquipTool(findFirstChild4)
      character48.HumanoidRootPart.CFrame = CFrame.new(-117, -57, 147)
    end
  end
end

function buyItem(p64, index78)
  local character49 = LocalPlayer.Character

  if not character49 or not character49:FindFirstChild("HumanoidRootPart") then
    return
  else
    local cframe5 = character49.HumanoidRootPart.CFrame
    character49.HumanoidRootPart.CFrame = index78.Head.CFrame * CFrame.new(0, 2, 3)
    task.wait(0.25)

    if index78:FindFirstChild("ClickDetector") then
      fireclickdetector(index78.ClickDetector)
    end

    task.wait(0.25)
    character49.HumanoidRootPart.CFrame = cframe5
    return
  end
end

function handleAutoWeight(key19, p65)
  task.spawn(function()
    while isAutoWeightActive do
      local character50 = LocalPlayer.Character

      if not character50 then
        break
      end

      if character50:FindFirstChild(key19) then
        character50[key19]:Activate()
      else
        if not LocalPlayer.Backpack:FindFirstChild(key19) then
          buyItem(key19, p65)
          task.wait(0.25)
        end

        equipItem(key19)
      end

      task.wait(0.1)
    end
  end)
end

Misc:AddToggle("AutoWeigh", {
  Text = "Auto Weigh",
  Default = false,
  Callback = function(value116)
    isAutoWeightActive = false
    task.wait(0.1)
    isAutoWeightActive = value116

    if value116 then
      Notify("Auto Weight Enabled", 2)
      local heavyWeights = findShopItem("[HeavyWeights]")

      if heavyWeights then
        handleAutoWeight("[HeavyWeights]", heavyWeights)
      end
    else
      Notify("Auto Weight Disabled", 1.5)
    end
  end,
})

Misc:AddToggle("AutoSkinny", {
  Text = "Auto Skinny",
  Default = false,
  Callback = function(value117)
    isAutoWeightActive = false
    task.wait(0.1)
    isAutoWeightActive = value117

    if value117 then
      Notify("Auto Skinny Enabled", 2)
      local lettuce = findShopItem("[Lettuce]")

      if lettuce then
        handleAutoWeight("[Lettuce]", lettuce)
      end
    else
      Notify("Auto Skinny Disabled", 1.5)
    end
  end,
})

kidnapState = {
  active = false,
  tpCFrame = nil,
  alreadySat = false,
  loopCreated = false,
  amount = 0,
  conn = nil,
  victimInput = "",
  destInput = "",
  lastAlert = 0,
}

function tpwheels()
  local findFirstChild5 = workspace.OldVehicles
    and workspace.OldVehicles:FindFirstChild(LocalPlayer.Name .. "BIKE")

  if findFirstChild5 and findFirstChild5:FindFirstChild("Seat") then
    local position5 = findFirstChild5.Seat.Position

    for index79, value118 in ipairs({ "LBWheel", "LTWheel", "RBWheel", "RTWheel" }) do
      if findFirstChild5:FindFirstChild(value118) then
        findFirstChild5[value118].CFrame = CFrame.new(position5)
      end
    end
  end
end

function findMatchingPlayer(p66)
  if p66 == "" then
    return
  else
    local lower = p66:lower()

    for index80, value119 in ipairs(Players:GetPlayers()) do
      if value119 ~= LocalPlayer
        and (value119.Name:lower():find(lower, 1, true)
          or value119.DisplayName:lower():find(lower, 1, true)) then
        return value119
      end
    end

    return
  end
end

function executeKidnapStep(p67, tpCFrame, p68)
  local character51 = LocalPlayer.Character

  local v207 = not character51 or not character51:FindFirstChild("HumanoidRootPart") or not p67
    or not p67.Character or not p67.Character:FindFirstChild("UpperTorso")

  local seat, vehicleSeat

  if v207 then
    return
  else
    kidnapState.tpCFrame = tpCFrame

    local findFirstChild6 = workspace.OldVehicles
      and workspace.OldVehicles:FindFirstChild(LocalPlayer.Name .. "BIKE")

    if not findFirstChild6 then
      if character51:FindFirstChildWhichIsA("Tool") then
        character51:FindFirstChildWhichIsA("Tool").Parent = LocalPlayer.Backpack
      end

      local foodsCart = findShopItem("[FoodsCart]")

      if foodsCart and foodsCart:FindFirstChild("Head")
        and foodsCart:FindFirstChild("ClickDetector") then
        character51.HumanoidRootPart.CFrame = foodsCart.Head.CFrame * CFrame.new(0, -3.1, 0)
        fireclickdetector(foodsCart.ClickDetector, 0)

        if os.clock() - kidnapState.lastAlert > 3 then
          kidnapState.lastAlert = os.clock()
          Notify("Cart TP: Replacing cart...", 2)
        end
      end

      return
    end

    vehicleSeat = findFirstChild6:FindFirstChild("VehicleSeat")
    seat = findFirstChild6:FindFirstChild("Seat")

    if not vehicleSeat or not seat then
      return
    end

    if not vehicleSeat:FindFirstChildWhichIsA("Weld") then
      character51.HumanoidRootPart.CFrame = vehicleSeat.CFrame
      return
    end

    if not seat:FindFirstChildWhichIsA("Weld") and not kidnapState.alreadySat then
      seat.CFrame = p67.Character.UpperTorso.CFrame
    elseif seat:FindFirstChildWhichIsA("Weld") or kidnapState.alreadySat then
      if not kidnapState.alreadySat then
        kidnapState.alreadySat = true
        Notify("Secured target: " .. p67.Name, 2)
      end

      if seat:FindFirstChildWhichIsA("Weld") then
        seat.CFrame = kidnapState.tpCFrame
        vehicleSeat.CFrame = kidnapState.tpCFrame
      elseif not kidnapState.loopCreated then
        kidnapState.loopCreated = true

        if kidnapState.conn then
          kidnapState.conn:Disconnect()
          kidnapState.conn = nil
        end

        task.spawn(function()
          Notify("Unloading passenger...", 1.5)

          while vehicleSeat:FindFirstChildWhichIsA("Weld") and kidnapState.amount < 0.5 do
            seat.CFrame = kidnapState.tpCFrame
            vehicleSeat.CFrame = kidnapState.tpCFrame
            kidnapState.amount = kidnapState.amount + task.wait()
          end

          local humanoid34 = character51:FindFirstChildOfClass("Humanoid")

          if humanoid34 then
            humanoid34.Sit = false
          end

          task.wait(0.1)

          character51.HumanoidRootPart.CFrame = character51.HumanoidRootPart.CFrame
            + Vector3.new(0, 5, 0)

          kidnapState.active = false
          kidnapState.alreadySat = false
          kidnapState.loopCreated = false
          kidnapState.amount = 0

          Notify("Delivered " .. p67.Name .. " successfully!", 2)
        end)
      end
    end

    return
  end
end

function startKidnap()
  if kidnapState.active then
    return
  end

  local v208 = findMatchingPlayer(kidnapState.victimInput)
  local v209 = findMatchingPlayer(kidnapState.destInput)
  local humanoidRootPart18

  if not v208 then
    Notify("Error: Victim not found.", 2)
    return
  elseif not v209 then
    Notify("Error: Destination not found.", 2)
    return
  elseif v208 == v209 then
    Notify("Error: Cannot target self.", 2)
    return
  else
    humanoidRootPart18 = v209.Character and v209.Character:FindFirstChild("HumanoidRootPart")

    if not humanoidRootPart18 then
      Notify("Error: Destination missing RootPart.", 2)
      return
    end

    kidnapState.active = true
    kidnapState.alreadySat = false
    kidnapState.loopCreated = false
    kidnapState.amount = 0
    kidnapState.tpCFrame = nil

    Notify("Bringing " .. v208.Name .. " to " .. v209.Name, 2)

    kidnapState.conn = RunService.Heartbeat:Connect(function()
      if not kidnapState.active then
        if kidnapState.conn then
          kidnapState.conn:Disconnect()
          kidnapState.conn = nil
        end

        return
      elseif not v208.Parent then
        kidnapState.active = false

        if kidnapState.conn then
          kidnapState.conn:Disconnect()
          kidnapState.conn = nil
        end

        Notify("Interrupted: Target left game.", 2)
        return
      else
        executeKidnapStep(v208, v209.Character and v209.Character:FindFirstChild("HumanoidRootPart")
            and v209.Character.HumanoidRootPart.CFrame
          or humanoidRootPart18.CFrame, "@" .. v209.Name)

        return
      end
    end)

    return
  end
end

Teleports:addLabel("Teleport target to others", "Teleport them to someone")

Teleports:addTextBox("KidnapPlayerVictimInput", "", function(p69)
  kidnapState.victimInput = p69

  if p69 ~= "" then
    Notify("Target Set: " .. p69, 1.5)
  end
end)

Teleports:addTextBox("KidnapPlayerDestInput", "", function(p70)
  kidnapState.destInput = p70

  if p70 ~= "" then
    Notify("Destination Set: " .. p70, 1.5)
  end
end)

Teleports:addButton("Send to Player", startKidnap)

Teleports:addButton("Stop Cart", function()
  if kidnapState.active then
    kidnapState.active = false

    if kidnapState.conn then
      kidnapState.conn:Disconnect()
      kidnapState.conn = nil
    end

    kidnapState.alreadySat = false
    kidnapState.loopCreated = false
    kidnapState.amount = 0

    local humanoid35 = LocalPlayer.Character
      and LocalPlayer.Character:FindFirstChildOfClass("Humanoid")

    if humanoid35 then
      humanoid35.Sit = false
    end

    Notify("Delivery Cancelled", 1.5)
  end
end)

Teleports:addLabel("Teleports", "Tp")

locations = {
  {
    name = "Uphill Gunstore",
    position = CFrame.new(481.30459594727, 48.070503234863, -620.1513671875),
  },
  {
    name = "Downhill Gunstore",
    position = CFrame.new(-578.57965087891, 8.3147792816162, -736.38848876953),
  },
  { name = "Bank", position = CFrame.new(-432.14392089844, 38.964965820312, -284.10165405273) },
  { name = "Safe 1", position = CFrame.new(-117, -57, 147) },
  { name = "School", position = CFrame.new(-531.35314941406, 21.749992370605, 252.47506713867) },
  {
    name = "Da Casino",
    position = CFrame.new(-863.46643066406, 21.599954605103, -152.92788696289),
  },
  {
    name = "Basketball Court",
    position = CFrame.new(-896.56433105469, 21.99981880188, -528.73175048828),
  },
  {
    name = "FoodsMart",
    position = CFrame.new(-906.58337402344, 22.005002975464, -653.22259521484),
  },
  {
    name = "Military Base",
    position = CFrame.new(-50.41296005249, 25.254997253418, -868.92114257812),
  },
  {
    name = "Da Boxing",
    position = CFrame.new(-232.0669708252, 22.067293167114, -1119.9541015625),
  },
  {
    name = "Hospital",
    position = CFrame.new(98.401962280273, 22.799989700317, -484.89385986328),
  },
  {
    name = "Police Station",
    position = CFrame.new(-265.49996948242, 21.79797744751, -96.515174865723),
  },
  { name = "Church", position = CFrame.new(205.82136535645, 23.778020858765, -58.470775604248) },
}

for index81, value120 in ipairs(locations) do
  local v210 = value120

  Teleports:addButton(v210.name, function()
    local humanoidRootPart19 = LocalPlayer.Character
      and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

    if humanoidRootPart19 then
      humanoidRootPart19.CFrame = v210.position
    else
      Notify("Character RootPart not found!", 1.5)
    end
  end)
end

T = {
  TargetPlayerInput = "",
  AutoBagEnabled = false,
  AutoBagLoop = nil,
  isBuying = false,
  lastVehicleAlert = 0,
  dynamicAlertCooldown = 0,
  MouseTargetingEnabled = false,
  MobileToolConnection = nil,
  CurrentMobileTool = nil,
  ViewEnabled = false,
  ViewLoop = nil,
  GunAutoKillEnabled = false,
  GunKillLoop = nil,
  lastGunNotificationTime = 0,
  lastTpTick = 0,
  currentGunOffset = Vector3.new(20, 0, 0),
  originalCFrame = nil,
  buyingAmmoState = false,
  FlingToggle = false,
  FlingConnection = nil,
  OriginalCFrame = nil,
  FlameAutoKillEnabled = false,
  FlameKillLoop = nil,
  isBuyingAmmo = false,
  SelectedMelee = "[Knife]",
  AttackMode = "Hide Heavy Punch",
  isBuyingMelee = false,
  bringStartPosition = nil,
  lastGrabAttempt = 0,
  BringEnabled = false,
  BringLoop = nil,
  AutoAmmoEnabled = false,
  lastReload = 0,
  reloadCooldown = 3,
  buyingFlameState = false,
  shopSpoofCFrame = nil,
  originalCameraSubject = nil,
  GunVelocityPrediction = 5,
  buyingGunsState = false,
  LastPositions = {},
  LastTimes = {},
  GunAutoKillHookEnabled = false,
  GunHookLoop = nil,
  GunHook = nil,
}

local g2 = _G
g2.SelectedMelee = _G.SelectedMelee or "[Knife]"

_G.MyActiveAction = "Idle"
VoidCFrame = CFrame.new(18812581888888, 1e+29, 998235235621111)
TargetHeavyID = "rbxassetid://3033717454"
HitFrameSeconds = 0.82
StrikeBuffer = 0.4

function findTargetPlayer(p71)
  if p71 == "" then
    return
  else
    local lower2 = p71:lower()

    for index82, value121 in ipairs(Players:GetPlayers()) do
      if value121 ~= LocalPlayer
        and (value121.Name:lower():find(lower2, 1, true)
          or value121.DisplayName:lower():find(lower2, 1, true)) then
        return value121
      end
    end

    return
  end
end

isMobile = UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
local v211 = isMobile
hudW = isMobile and 320 or 420
hudH = v211 and 54 or 65
local v212 = isMobile
slotW = isMobile and 150 or 200
targetSlotX = v212 and 165 or 215
local v213 = isMobile
pfpSize = isMobile and 36 or 44
textPaddingX = v213 and 10 or 18

if coreGui:FindFirstChild("StatusHUDGui") then
  coreGui.StatusHUDGui:Destroy()
end

hudGui = Instance.new("ScreenGui")
hudGui.Name = "StatusHUDGui"
hudGui.Parent = coreGui
hudGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

MainHUD = Instance.new("Frame")
MainHUD.Name = "MainHUD"
MainHUD.Parent = hudGui
MainHUD.BackgroundColor3 = Color3.fromRGB(15, 15, 15)
MainHUD.BackgroundTransparency = 0.15
MainHUD.BorderSizePixel = 0
MainHUD.Position = UDim2.new(0.5, -hudW / 2, 0, 15)
MainHUD.Size = UDim2.new(0, hudW, 0, hudH)
MainHUD.Visible = false

Instance.new("UICorner", MainHUD).CornerRadius = UDim.new(0, 6)

hudStroke = Instance.new("UIStroke", MainHUD)
hudStroke.Color = Color3.fromRGB(35, 35, 35)
hudStroke.Thickness = 1

function createProfileSlot(parent, p72, p73, p74)
  local frame4 = Instance.new("Frame")
  frame4.Name = p72 .. "Slot"
  frame4.Parent = parent
  frame4.BackgroundTransparency = 1
  frame4.Position = UDim2.new(0, p73, 0, 0)
  frame4.Size = UDim2.new(0, p74, 1, 0)

  local avatar2 = Instance.new("ImageLabel")
  avatar2.Name = "Avatar"
  avatar2.Parent = frame4
  avatar2.Position = UDim2.new(0, isMobile and 6 or 10, 0.5, -pfpSize / 2)
  avatar2.Size = UDim2.new(0, pfpSize, 0, pfpSize)
  avatar2.BackgroundColor3 = Color3.fromRGB(25, 25, 25)
  avatar2.BorderSizePixel = 0

  Instance.new("UICorner", avatar2).CornerRadius = UDim.new(0, 5)
  local v214 = (isMobile and 6 or 10) + pfpSize + textPaddingX

  local userTag = Instance.new("TextLabel")
  userTag.Name = "UserTag"
  userTag.Parent = frame4
  userTag.Position = UDim2.new(0, v214, 0, isMobile and 8 or 12)
  userTag.Size = UDim2.new(1, -v214 - 5, 0, isMobile and 14 or 16)
  userTag.Font = Enum.Font.GothamBold
  userTag.TextSize = isMobile and 10 or 12
  userTag.TextColor3 = Color3.fromRGB(240, 240, 240)
  userTag.TextXAlignment = Enum.TextXAlignment.Left
  userTag.BackgroundTransparency = 1

  local status = Instance.new("TextLabel")
  status.Name = "Status"
  status.Parent = frame4
  status.Position = UDim2.new(0, v214, 0, isMobile and 24 or 28)
  status.Size = UDim2.new(1, -v214 - 5, 0, isMobile and 20 or 24)
  status.Font = Enum.Font.GothamSemibold
  status.TextSize = isMobile and 9 or 11
  status.TextColor3 = Color3.fromRGB(160, 160, 160)
  status.TextXAlignment = Enum.TextXAlignment.Left
  status.BackgroundTransparency = 1
  status.TextWrapped = true

  return avatar2, userTag, status
end

local v215, v216
myPfp, v216, v215 = createProfileSlot(MainHUD, "Self", 5, slotW)
myName = v216
myStatus = v215
local v217, v218
tarPfp, v217, v218 = createProfileSlot(MainHUD, "Target", targetSlotX, slotW)
tarName = v217
tarStatus = v218
cachedTargetUserId = 0
currentHighlight = nil

function clearTargetHighlight()
  if currentHighlight then
    currentHighlight:Destroy()
    currentHighlight = nil
  end
end

RunService.Heartbeat:Connect(function()
  local v219 = findTargetPlayer(T.TargetPlayerInput)

  if not v219 or not v219.Character then
    MainHUD.Visible = false
    cachedTargetUserId = 0
    clearTargetHighlight()
    return
  else
    MainHUD.Visible = true

    if not currentHighlight or currentHighlight.Parent ~= v219.Character then
      clearTargetHighlight()

      local targetOutline = Instance.new("Highlight")
      targetOutline.Name = "TargetOutline"
      targetOutline.OutlineColor = Color3.fromRGB(170, 0, 255)
      targetOutline.OutlineTransparency = 0
      targetOutline.FillColor = Color3.fromRGB(170, 0, 255)
      targetOutline.FillTransparency = 0.85
      targetOutline.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
      targetOutline.Adornee = v219.Character
      targetOutline.Parent = v219.Character

      currentHighlight = targetOutline
    end

    myName.Text = LocalPlayer.DisplayName
    myPfp.Image = "rbxthumb://type=AvatarHeadShot&id=" .. LocalPlayer.UserId .. "&w=150&h=150"
    local character52 = LocalPlayer.Character

    local humanoidRootPart20 = character52

    humanoidRootPart20 = character52
      and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

    if humanoidRootPart20 then
      if humanoidRootPart20.Position.Y >= 50000
        or math.abs(humanoidRootPart20.Position.X) > 1000000 then
        myStatus.Text = [[
Status: <font color="#8250FA">[IN VOID]</font>
Action: ]] .. _G.MyActiveAction
      else
        myStatus.Text = [[
Status: <font color="#00DC78">Normal</font>
Action: ]] .. _G.MyActiveAction
      end

      myStatus.RichText = true
    end

    tarName.Text = v219.DisplayName

    if cachedTargetUserId ~= v219.UserId then
      cachedTargetUserId = v219.UserId
      tarPfp.Image = "rbxthumb://type=AvatarHeadShot&id=" .. v219.UserId .. "&w=150&h=150"
    end

    local character53 = v219.Character

    local humanoidRootPart21 = character53
    humanoidRootPart21 = character53 and character53:FindFirstChild("HumanoidRootPart")

    local humanoid36 = character53
    humanoid36 = character53 and character53:FindFirstChildOfClass("Humanoid")

    if character53 and humanoidRootPart21 and humanoid36 then
      local bodyEffects13 = character53:FindFirstChild("BodyEffects")

      local sdeath = bodyEffects13

      sdeath = bodyEffects13 and bodyEffects13:FindFirstChild("SDeath")
        and bodyEffects13.SDeath.Value == true

      local kO8 = bodyEffects13
        and (bodyEffects13:FindFirstChild("K.O") and bodyEffects13["K.O"].Value == true
          or bodyEffects13:FindFirstChild("KO") and bodyEffects13.KO.Value == true)

      local christmasSock = character53:FindFirstChild("Christmas_Sock")
      local forceField2 = character53:FindFirstChildOfClass("ForceField")
      local v220 = '<font color="#00DC78">Alive</font>'

      if sdeath or humanoid36.Health <= 0 then
        v220 = '<font color="#FF3232">[STOMPED / DEAD]</font>'
      elseif christmasSock then
        v220 = '<font color="#E6961E">[BAGGED]</font>'
      elseif kO8 then
        v220 = '<font color="#FFB400">[K.O KNOCKED]</font>'
      elseif humanoidRootPart21.Position.Y >= 50000
        or math.abs(humanoidRootPart21.Position.X) > 1000000 then
        v220 = '<font color="#8250FA">[IN VOID]</font>'
      end

      if forceField2 then
        v220 = v220 .. ' <font color="#00C8FF">[FF ACTIVE]</font>'
      end

      tarStatus.Text = "State: " .. v220 .. "\nHP: " .. math.floor(humanoid36.Health) .. " / "
        .. math.floor(humanoid36.MaxHealth)

      tarStatus.RichText = true
    else
      tarStatus.Text = 'State: <font color="#787878">Dead / Respawning</font>'
      tarStatus.RichText = true
    end

    return
  end
end)

function equipTool(p75)
  local character54 = LocalPlayer.Character
  local backpack2 = LocalPlayer.Backpack

  if character54 and backpack2 then
    local findFirstChild7 = backpack2:FindFirstChild(p75)

    if findFirstChild7 then
      findFirstChild7.Parent = character54
    end
  end
end

function getClosestPlayerToCursor()
  local huge5 = math.huge
  local getMouseLocation = UserInputService:GetMouseLocation()
  local players9 = Players
  local v221

  for index83, value122 in ipairs(players9:GetPlayers()) do
    if value122 ~= LocalPlayer and value122.Character
      and value122.Character:FindFirstChild("HumanoidRootPart") then
      local v222, v223 = Camera2:WorldToViewportPoint(value122.Character.HumanoidRootPart.Position)

      if v223 then
        local magnitude12 = (getMouseLocation - Vector2.new(v222.X, v222.Y)).Magnitude

        if magnitude12 < huge5 then
          v221 = value122
          huge5 = magnitude12
        end
      end
    end
  end

  return v221
end

Target:addTextBox("TargetPlayerInput", "", function(p76)
  T.TargetPlayerInput = p76

  if #p76 >= 2 then
    local v224 = findTargetPlayer(p76)

    if v224 then
      T.TargetPlayerInput = v224.Name
      Notify("Target Locked: " .. v224.DisplayName .. " (@" .. v224.Name .. ")", 2)

      pcall(function()
        local statusHUDGui = coreGui:FindFirstChild("StatusHUDGui")

        if statusHUDGui and statusHUDGui:FindFirstChild("MainHUD") then
          statusHUDGui.MainHUD.Visible = true
        end
      end)
    end
  elseif p76 == "" then
    T.TargetPlayerInput = ""

    pcall(function()
      local statusHUDGui2 = coreGui:FindFirstChild("StatusHUDGui")

      if statusHUDGui2 and statusHUDGui2:FindFirstChild("MainHUD") then
        statusHUDGui2.MainHUD.Visible = false
      end
    end)
  end
end)

function clearTargetState()
  T.TargetPlayerInput = ""

  function v8703()
    local statusHUDGui3 = coreGui:FindFirstChild("StatusHUDGui")

    if statusHUDGui3 and statusHUDGui3:FindFirstChild("MainHUD") then
      statusHUDGui3.MainHUD.Visible = false
    end
  end

  clearTargetHighlight()
end

Players.PlayerRemoving:Connect(function(player3)
  if T.TargetPlayerInput ~= "" and player3.Name == T.TargetPlayerInput then
    clearTargetState()
    Notify("Target left the game. State cleared.", 2)
  end
end)

function clearMobileTool()
  if T.MobileToolConnection then
    T.MobileToolConnection:Disconnect()
    T.MobileToolConnection = nil
  end

  if T.CurrentMobileTool then
    T.CurrentMobileTool:Destroy()
    T.CurrentMobileTool = nil
  end
end

function giveMobileTool()
  local waitForChild7 = LocalPlayer:WaitForChild("Backpack", 5)

  if not waitForChild7 then
    return
  else
    local targetSelector = waitForChild7:FindFirstChild("Target Selector")

    if targetSelector then
      targetSelector:Destroy()
    end

    local targetSelector2 = Instance.new("Tool")
    targetSelector2.Name = "Target Selector"
    targetSelector2.RequiresHandle = false
    targetSelector2.ToolTip = "Equip and tap near a target to lock on."

    targetSelector2.Activated:Connect(function()
      clearTargetState()
      task.wait()
      local v225 = getClosestPlayerToCursor()

      if v225 then
        T.TargetPlayerInput = v225.Name
        Notify("Target Locked: " .. v225.DisplayName .. " (@" .. v225.Name .. ")", 2)

        pcall(function()
          local statusHUDGui4 = coreGui:FindFirstChild("StatusHUDGui")

          if statusHUDGui4 and statusHUDGui4:FindFirstChild("MainHUD") then
            statusHUDGui4.MainHUD.Visible = true
          end
        end)
      else
        Notify("Target Cleared", 1.5)
      end
    end)

    T.CurrentMobileTool = targetSelector2
    targetSelector2.Parent = waitForChild7
    return
  end
end

Target:AddToggle("MouseTargetingEnabled", {
  Text = "Target with Mouse (Q)",
  Default = false,
  Callback = function(value123)
    T.MouseTargetingEnabled = value123

    if value123 then
      if isMobile then
        Notify("Mobile Targeting Enabled (Tool Added)", 2)
        giveMobileTool()

        T.MobileToolConnection = LocalPlayer.CharacterAdded:Connect(function()
          task.wait(0.5)

          if T.MouseTargetingEnabled then
            giveMobileTool()
          end
        end)
      else
        Notify("Mouse Targeting Enabled (Press Q)", 2)
      end
    else
      Notify("Mouse Targeting Disabled", 1.5)
      clearTargetState()

      if isMobile then
        clearMobileTool()
      end
    end
  end,
})

UserInputService.InputBegan:Connect(function(input4, p77)
  if p77 or isMobile then
    return
  end

  if T.MouseTargetingEnabled and input4.KeyCode == Enum.KeyCode.Q then
    clearTargetState()
    task.wait()
    local v226 = getClosestPlayerToCursor()

    if v226 then
      T.TargetPlayerInput = v226.Name
      Notify("Target Locked: " .. v226.DisplayName .. " (@" .. v226.Name .. ")", 2)

      pcall(function()
        local statusHUDGui5 = coreGui:FindFirstChild("StatusHUDGui")

        if statusHUDGui5 and statusHUDGui5:FindFirstChild("MainHUD") then
          statusHUDGui5.MainHUD.Visible = true
        end
      end)
    else
      Notify("Target Cleared", 1.5)
    end
  end
end)

Target:addButton("Teleport to Target", function()
  local v227 = findTargetPlayer(T.TargetPlayerInput)

  if v227 and v227.Character and v227.Character:FindFirstChild("HumanoidRootPart") then
    local humanoidRootPart22 = LocalPlayer.Character
      and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

    if humanoidRootPart22 then
      humanoidRootPart22.AssemblyLinearVelocity = Vector3.zero
      humanoidRootPart22.AssemblyAngularVelocity = Vector3.zero

      task.wait(0.01)
      humanoidRootPart22.CFrame = v227.Character.HumanoidRootPart.CFrame * CFrame.new(0, 0, 3)
      Notify("Teleported to: " .. v227.DisplayName, 2)
    else
      Notify("Your Character Root was not found", 2)
    end
  else
    Notify("No active target found or target is dead", 1.5)
  end
end)

Target:addButton("Clear Target", function()
  T.TargetPlayerInput = ""
  _G.MyActiveAction = "Idle"
  clearTargetHighlight()

  pcall(function()
    local statusHUDGui6 = coreGui:FindFirstChild("StatusHUDGui")

    if statusHUDGui6 and statusHUDGui6:FindFirstChild("MainHUD") then
      statusHUDGui6.MainHUD.Visible = false
    end
  end)

  local humanoid37 = LocalPlayer.Character
    and LocalPlayer.Character:FindFirstChildOfClass("Humanoid")

  if humanoid37 then
    Camera2.CameraSubject = humanoid37
  end

  Notify("Target Cleared", 1.5)
end)

Target:AddToggle("ViewTargetEnabled", {
  Text = "View Target",
  Default = false,
  Callback = function(value124)
    T.ViewEnabled = value124

    if T.ViewLoop then
      T.ViewLoop:Disconnect()
      T.ViewLoop = nil
    end

    if value124 then
      Notify("Spectating Target Loop Active", 1.5)

      T.ViewLoop = RunService.RenderStepped:Connect(function()
        if not T.ViewEnabled then
          if T.ViewLoop then
            T.ViewLoop:Disconnect()
            T.ViewLoop = nil
          end

          return
        else
          local v228 = findTargetPlayer(T.TargetPlayerInput)

          local humanoid38 = v228 and v228.Character
            and v228.Character:FindFirstChildOfClass("Humanoid")

          if humanoid38 then
            if Camera2.CameraSubject ~= humanoid38 then
              Camera2.CameraSubject = humanoid38
            end
          else
            local humanoid39 = LocalPlayer.Character
              and LocalPlayer.Character:FindFirstChildOfClass("Humanoid")

            if humanoid39 and Camera2.CameraSubject ~= humanoid39 then
              Camera2.CameraSubject = humanoid39
            end
          end

          return
        end
      end)
    else
      local humanoid40 = LocalPlayer.Character
        and LocalPlayer.Character:FindFirstChildOfClass("Humanoid")

      if humanoid40 then
        Camera2.CameraSubject = humanoid40
      end

      Notify("Camera Reset", 1.5)
    end
  end,
})

function getReserveAmmo(p78)
  local inventory = LocalPlayer:FindFirstChild("DataFolder")
    and LocalPlayer.DataFolder:FindFirstChild("Inventory")

  if inventory then
    local findFirstChild8 = inventory:FindFirstChild(p78)

    if findFirstChild8 then
      return tonumber(findFirstChild8.Value) or 0
    end

    return 0
  end

  return 0
end

RocketTP = false
TargetPlr = nil
listenerConnected = false

function getRPGTarget()
  if not T.TargetPlayerInput or T.TargetPlayerInput == "" then
    return
  end

  return findTargetPlayer(T.TargetPlayerInput)
end

function setupRPGTP()
  if listenerConnected then
    return
  else
    local ignored3 = workspace:FindFirstChild("Ignored")

    if not ignored3 then
      return
    end

    listenerConnected = true

    ignored3.ChildAdded:Connect(function(child3)
      if not RocketTP or not TargetPlr or not TargetPlr.Character then
        return
      end

      local waitForChild8, connect5

      if child3.Name ~= "Model" and child3.Name ~= "GrenadeLauncherAmmo" then
        return
      else
        local v229 = child3.Name == "GrenadeLauncherAmmo"

        waitForChild8 = v229 and child3:WaitForChild("Main", 2)
          or child3:WaitForChild("Launcher", 2)

        if not waitForChild8 then
          return
        end

        if not v229 then
          local bodyVelocity = waitForChild8:FindFirstChildOfClass("BodyVelocity")

          local findFirstChildWhichIsA = waitForChild8:FindFirstChildWhichIsA(
            "TouchTransmitter", true
          )

          if bodyVelocity then
            bodyVelocity:Destroy()
          end

          if findFirstChildWhichIsA then
            findFirstChildWhichIsA:Destroy()
          end
        end

        connect5 = nil

        connect5 = RunService.Heartbeat:Connect(function()
          if not RocketTP or not TargetPlr or not TargetPlr.Character or not waitForChild8
            or not waitForChild8.Parent then
            if connect5 then
              connect5:Disconnect()
              connect5 = nil
            end

            return
          end

          local humanoidRootPart23 = TargetPlr.Character:FindFirstChild("HumanoidRootPart")

          if not humanoidRootPart23 then
            return
          end

          local humanoidRootPart24 = LocalPlayer.Character
            and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

          if humanoidRootPart24 then
            pcall(function()
              sethiddenproperty(humanoidRootPart24, "PhysicsRepRootPart", humanoidRootPart23)
            end)
          end

          waitForChild8.CFrame = humanoidRootPart23.CFrame
          waitForChild8.Velocity = humanoidRootPart23.AssemblyLinearVelocity
        end)

        child3.Destroying:Connect(function()
          if connect5 then
            connect5:Disconnect()
            connect5 = nil
          end
        end)

        return
      end
    end)

    return
  end
end

setupRPGTP()

LocalPlayer.CharacterAdded:Connect(function()
  listenerConnected = false
  task.defer(setupRPGTP)
end)

Target:AddToggle("RPGTPEnabled", {
  Text = "RPG TP",
  Default = false,
  Keybind = Enum.KeyCode.Unknown,
  Callback = function(value125)
    RocketTP = value125

    if value125 then
      TargetPlr = getRPGTarget()

      if TargetPlr then
        Notify("RPG TP Target: " .. TargetPlr.DisplayName .. " (@" .. TargetPlr.Name .. ")", 3)
      else
        RocketTP = false
        TargetPlr = nil
        Notify("Set a target first.", 3)
      end
    else
      TargetPlr = nil
    end
  end,
})

task.spawn(function()
  while task.wait(0.2) do
    if RocketTP then
      TargetPlr = getRPGTarget() or nil
    end
  end
end)

Target:AddToggle("FlingToggleEnabled", {
  Text = "Fling",
  Default = false,
  Keybind = Enum.KeyCode.Unknown,
  Callback = function(value126)
    T.FlingToggle = value126
    local humanoidRootPart25

    if value126 then
      local humanoidRootPart26 = LocalPlayer.Character
        and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

      if humanoidRootPart26 then
        T.OriginalCFrame = humanoidRootPart26.CFrame
      end

      if T.FlingConnection then
        T.FlingConnection:Disconnect()
      end

      T.FlingConnection = RunService.Heartbeat:Connect(function()
        local humanoidRootPart27, humanoidRootPart28

        if not T.FlingToggle then
          if T.FlingConnection then
            T.FlingConnection:Disconnect()
            T.FlingConnection = nil
          end

          return
        else
          humanoidRootPart27 = LocalPlayer.Character
            and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

          local findFirstChild9 = T.TargetPlayerInput ~= ""
            and Players:FindFirstChild(T.TargetPlayerInput)

          if findFirstChild9 and findFirstChild9.Character and humanoidRootPart27 then
            humanoidRootPart28 = findFirstChild9.Character:FindFirstChild("HumanoidRootPart")
            local humanoid41 = findFirstChild9.Character:FindFirstChildOfClass("Humanoid")

            if humanoidRootPart28 and humanoid41 and humanoid41.Health > 0 then
              humanoidRootPart27.CFrame = humanoidRootPart28.CFrame

              pcall(function()
                sethiddenproperty(humanoidRootPart27, "PhysicsRepRootPart", humanoidRootPart28)
              end)

              local assemblyLinearVelocity = humanoidRootPart27.AssemblyLinearVelocity
              humanoidRootPart27.AssemblyLinearVelocity = Vector3.new(99999, 99999, 99999)
              task.wait()

              if humanoidRootPart27 then
                humanoidRootPart27.AssemblyLinearVelocity = assemblyLinearVelocity
              end
            else
              pcall(function()
                sethiddenproperty(humanoidRootPart27, "PhysicsRepRootPart", nil)
              end)
            end
          elseif humanoidRootPart27 then
            pcall(function() sethiddenproperty(humanoidRootPart27, "PhysicsRepRootPart", nil) end)
          end

          return
        end
      end)
    else
      if T.FlingConnection then
        T.FlingConnection:Disconnect()
        T.FlingConnection = nil
      end

      humanoidRootPart25 = LocalPlayer.Character
        and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

      if humanoidRootPart25 then
        pcall(function() sethiddenproperty(humanoidRootPart25, "PhysicsRepRootPart", nil) end)

        if T.OriginalCFrame then
          humanoidRootPart25.CFrame = T.OriginalCFrame
          T.OriginalCFrame = nil
        end

        humanoidRootPart25.AssemblyLinearVelocity = Vector3.zero
        humanoidRootPart25.AssemblyAngularVelocity = Vector3.zero
      end
    end
  end,
})

flameVisualizer = nil

function handleFlameVisualizer(p79, p80, p81)
  if p79 and p80 then
    if not flameVisualizer then
      local character55 = LocalPlayer.Character

      if character55 then
        character55.Archivable = true

        flameVisualizer = character55:Clone()
        flameVisualizer.Name = "Flame_Visualizer"

        for index84, value127 in ipairs(flameVisualizer:GetDescendants()) do
          if value127:IsA("BasePart") or value127:IsA("Decal") then
            value127.Transparency = 0.5

            if value127:IsA("BasePart") then
              value127.Material = Enum.Material.ForceField
              value127.Color = p81 or Color3.fromRGB(255, 120, 0)
              value127.CanCollide = false
              value127.Anchored = true
            end
          elseif value127:IsA("Script") or value127:IsA("LocalScript") then
            value127:Destroy()
          end
        end

        flameVisualizer.Parent = workspace
      end
    end

    if flameVisualizer then
      flameVisualizer:PivotTo(p80)
    end
  elseif flameVisualizer then
    flameVisualizer:Destroy()
    flameVisualizer = nil
  end
end

walkAnchor = workspace:FindFirstChild("Flame_Walk_Anchor")

if not walkAnchor then
  walkAnchor = Instance.new("Part")
  walkAnchor.Name = "Flame_Walk_Anchor"
  walkAnchor.Size = Vector3.new(1, 1, 1)
  walkAnchor.Anchored = true
  walkAnchor.CanCollide = false
  walkAnchor.Transparency = 1
  walkAnchor.Parent = workspace
end

Target:AddToggle("AutoFlameKillEnabled", {
  Text = "Auto Flame Kill",
  Default = false,
  Keybind = Enum.KeyCode.Unknown,
  Callback = function(value128)
    T.FlameAutoKillEnabled = value128
    local humanoidRootPart29

    if value128 then
      Notify("Auto Flame Kill Active (Free Movement, Camera Safe)", 2)
      _G.MyActiveAction = "Flame Core Loop"

      T.FlameKillLoop = RunService.Heartbeat:Connect(function()
        local cframe6, character56, backpack3, v230, v231, humanoidRootPart30

        if not T.FlameAutoKillEnabled then
          if T.FlameKillLoop then
            T.FlameKillLoop:Disconnect()
            T.FlameKillLoop = nil
          end

          return
        else
          character56 = LocalPlayer.Character

          local humanoidRootPart31 = character56
            and character56:FindFirstChild("HumanoidRootPart")

          local humanoid42 = character56 and character56:FindFirstChildOfClass("Humanoid")
          backpack3 = LocalPlayer:FindFirstChild("Backpack")

          if not humanoidRootPart31 or not humanoid42 then
            return
          else
            local cframe7 = humanoidRootPart31.CFrame
            local assemblyLinearVelocity2 = humanoidRootPart31.AssemblyLinearVelocity
            local assemblyAngularVelocity = humanoidRootPart31.AssemblyAngularVelocity
            walkAnchor.CFrame = cframe7 * CFrame.new(0, 1.5, 0)

            if Camera2.CameraSubject ~= walkAnchor then
              T.originalCameraSubject = Camera2.CameraSubject
              Camera2.CameraSubject = walkAnchor
            end

            if T.buyingFlameState and T.shopSpoofCFrame then
              handleFlameVisualizer(false)
              humanoidRootPart31.CFrame = T.shopSpoofCFrame
              RunService.RenderStepped:Wait()

              humanoidRootPart31.CFrame = cframe7
              humanoidRootPart31.AssemblyLinearVelocity = assemblyLinearVelocity2

              return
            else
              local flamethrower = character56:FindFirstChild("[Flamethrower]")
                or backpack3 and backpack3:FindFirstChild("[Flamethrower]")

              if T.AutoAmmoEnabled and not T.buyingFlameState then
                v230 = not flamethrower
                v231 = false

                if flamethrower then
                  local ammo = flamethrower:FindFirstChild("Ammo")

                  if ammo and ammo.Value <= 5 then
                    v231 = true
                  end
                end

                if v230 or v231 then
                  T.buyingFlameState = true

                  local g3 = _G
                  g3.MyActiveAction = v230 and "Buying Flamethrower" or "Restocking 10x Ammo"

                  handleFlameVisualizer(false)

                  task.spawn(function()
                    local flamethrower2 = findShopItem("[Flamethrower]")
                    local flamethrowerAmmo = findShopItem("[Flamethrower Ammo]")

                    if v230 and flamethrower2 then
                      if flamethrower and flamethrower.Parent == character56 then
                        flamethrower.Parent = backpack3
                        task.wait(0.1)
                      end

                      T.shopSpoofCFrame = flamethrower2:GetPivot() + Vector3.new(0, 3, 0)
                      task.wait(0.3)

                      local findFirstChildWhichIsA2 = flamethrower2:FindFirstChildWhichIsA(
                        "ClickDetector", true
                      )

                      if findFirstChildWhichIsA2 then
                        fireclickdetector(findFirstChildWhichIsA2)
                        task.wait(0.25)
                      end
                    end

                    if T.FlameAutoKillEnabled and T.AutoAmmoEnabled and flamethrowerAmmo
                      and v231 then
                      T.shopSpoofCFrame = flamethrowerAmmo:GetPivot() + Vector3.new(0, 3, 0)
                      task.wait(0.3)

                      local findFirstChildWhichIsA3 = flamethrowerAmmo:FindFirstChildWhichIsA(
                        "ClickDetector", true
                      )

                      if findFirstChildWhichIsA3 then
                        for i8 = 1, 10 do
                          if not T.FlameAutoKillEnabled then
                            break
                          end

                          fireclickdetector(findFirstChildWhichIsA3)
                          task.wait(0.15)
                        end
                      end
                    end

                    task.wait(0.15)

                    T.shopSpoofCFrame = nil
                    T.buyingFlameState = false
                  end)

                  return
                end
              end

              local v232 = findTargetPlayer(T.TargetPlayerInput)

              if not v232 then
                handleFlameVisualizer(false)

                pcall(function()
                  sethiddenproperty(
                    humanoidRootPart31, "PhysicsRepRootPart", humanoidRootPart31
                  )
                end)

                return
              else
                local character57 = v232.Character

                humanoidRootPart30 = character57
                  and character57:FindFirstChild("HumanoidRootPart")

                local humanoid43 = character57 and character57:FindFirstChildOfClass("Humanoid")

                local upperTorso6 = character57
                  and (character57:FindFirstChild("UpperTorso")
                    or character57:FindFirstChild("Torso") or humanoidRootPart30)

                if not humanoidRootPart30 or not humanoid43 then
                  handleFlameVisualizer(false)
                  return
                else
                  local position6 = humanoidRootPart30.Position

                  local v233 = math.abs(position6.X) > 188125818888
                    or math.abs(position6.Y) > 1e+27 or math.abs(position6.Z) > 9982352356211

                  local bodyEffects14 = character57:FindFirstChild("BodyEffects")

                  local sdeath2 = bodyEffects14 and bodyEffects14:FindFirstChild("SDeath")
                    and bodyEffects14.SDeath.Value == true

                  local dead4 = bodyEffects14 and bodyEffects14:FindFirstChild("Dead")
                    and bodyEffects14.Dead.Value == true

                  local v234 = humanoid43.Health <= 0 or sdeath2 or dead4

                  local kO9 = bodyEffects14
                    and (bodyEffects14:FindFirstChild("K.O")
                        and bodyEffects14["K.O"].Value == true
                      or bodyEffects14:FindFirstChild("KO") and bodyEffects14.KO.Value == true)

                  if v233 or v234 or character57:FindFirstChildOfClass("ForceField") then
                    handleFlameVisualizer(false)

                    local g4 = _G

                    g4.MyActiveAction = v234 and "Target Executed (Void)"
                      or v233 and "Target In Extreme Void" or "Target Have FF (Waiting)"

                    pcall(function()
                      sethiddenproperty(
                        humanoidRootPart31, "PhysicsRepRootPart", humanoidRootPart31
                      )
                    end)

                    if flamethrower and flamethrower.Parent == character56 then
                      flamethrower:Deactivate()
                    end

                    return
                  else
                    local color5 = Color3.fromRGB(255, 120, 0)

                    if kO9 and not v234 then
                      _G.MyActiveAction = "Stomping Target"
                      color5 = Color3.fromRGB(255, 0, 0)

                      pcall(function()
                        sethiddenproperty(humanoidRootPart31, "PhysicsRepRootPart", nil)
                      end)

                      if flamethrower and flamethrower.Parent == character56 then
                        humanoid42:UnequipTools()
                      end

                      cframe6 = CFrame.new(upperTorso6.Position + Vector3.new(0, 2.9, 0))
                        * CFrame.Angles(0, math.rad(tick() * 180), 0)

                      if cframe6 then
                        handleFlameVisualizer(true, cframe6, color5)
                        humanoidRootPart31.CFrame = cframe6

                        if kO9 and not v234 then
                          ReplicatedStorage.MainEvent:FireServer("Stomp")
                        elseif flamethrower.Parent == character56 then
                          flamethrower:Activate()
                          local ammo2 = flamethrower:FindFirstChild("Ammo")

                          if ammo2 and ammo2.Value <= 0
                            and tick() - (T.lastReload or 0) > (T.reloadCooldown or 2) then
                            T.lastReload = tick()
                            ReplicatedStorage.MainEvent:FireServer("Reload", flamethrower)
                          end
                        end

                        RunService.RenderStepped:Wait()

                        humanoidRootPart31.CFrame = cframe7
                        humanoidRootPart31.AssemblyLinearVelocity = assemblyLinearVelocity2
                        humanoidRootPart31.AssemblyAngularVelocity = assemblyAngularVelocity
                      end

                      return
                    elseif not flamethrower then
                      _G.MyActiveAction = "Equip Flamethrower"

                      if tick() - (T.lastGunNotificationTime or 0) > 4 then
                        Notify("Please buy or equip a flamethrower first", 2)
                        T.lastGunNotificationTime = tick()
                      end

                      return
                    else
                      _G.MyActiveAction = "Burning Target"

                      for index85, value129 in ipairs(character56:GetChildren()) do
                        if value129:IsA("Tool") and value129.Name ~= "[Flamethrower]" then
                          value129.Parent = backpack3
                        end
                      end

                      local v235 = false

                      for key20, value130 in pairs(humanoid42:GetPlayingAnimationTracks()) do
                        local v236 = value130

                        if v236.Name == "LeftAim" then
                          v235 = true
                        else
                          pcall(function() v236:Stop() end)
                        end
                      end

                      if not v235 then
                        pcall(function()
                          humanoid42:LoadAnimation(ReplicatedStorage.IM.ANIM.LeftAim):Play()
                        end)
                      end

                      if flamethrower.Parent ~= character56 then
                        humanoid42:EquipTool(flamethrower)
                      end

                      pcall(function()
                        sethiddenproperty(
                          humanoidRootPart31, "PhysicsRepRootPart", humanoidRootPart30
                        )
                      end)

                      cframe6 = CFrame.new(upperTorso6.Position + Vector3.new(-2, 8, 2))

                      if cframe6 then
                        handleFlameVisualizer(true, cframe6, color5)
                        humanoidRootPart31.CFrame = cframe6

                        if kO9 and not v234 then
                          ReplicatedStorage.MainEvent:FireServer("Stomp")
                        elseif flamethrower.Parent == character56 then
                          flamethrower:Activate()
                          local ammo3 = flamethrower:FindFirstChild("Ammo")

                          if ammo3 and ammo3.Value <= 0
                            and tick() - (T.lastReload or 0) > (T.reloadCooldown or 2) then
                            T.lastReload = tick()
                            ReplicatedStorage.MainEvent:FireServer("Reload", flamethrower)
                          end
                        end

                        RunService.RenderStepped:Wait()

                        humanoidRootPart31.CFrame = cframe7
                        humanoidRootPart31.AssemblyLinearVelocity = assemblyLinearVelocity2
                        humanoidRootPart31.AssemblyAngularVelocity = assemblyAngularVelocity
                      end

                      return
                    end
                  end
                end
              end
            end
          end
        end
      end)
    else
      Notify("Auto Flame Kill Disabled", 1.5)
      _G.MyActiveAction = "Idle"

      T.buyingFlameState = false
      T.shopSpoofCFrame = nil

      handleFlameVisualizer(false)

      if T.originalCameraSubject then
        Camera2.CameraSubject = T.originalCameraSubject
        T.originalCameraSubject = nil
      end

      if T.FlameKillLoop then
        T.FlameKillLoop:Disconnect()
        T.FlameKillLoop = nil
      end

      humanoidRootPart29 = LocalPlayer.Character
        and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

      if humanoidRootPart29 then
        pcall(function()
          sethiddenproperty(humanoidRootPart29, "PhysicsRepRootPart", humanoidRootPart29)
        end)
      end
    end
  end,
})

bagVisualizer = nil
bagBeam = nil
attReal = nil
attVisual = nil

function handleBagVisualizer(p82, p83, p84)
  if p82 and p83 then
    local character58 = LocalPlayer.Character
    local humanoidRootPart32 = character58 and character58:FindFirstChild("HumanoidRootPart")

    if not bagVisualizer and character58 then
      character58.Archivable = true

      bagVisualizer = character58:Clone()
      bagVisualizer.Name = "Bag_Visualizer"

      for index86, value131 in ipairs(bagVisualizer:GetDescendants()) do
        if value131:IsA("BasePart") or value131:IsA("Decal") then
          value131.Transparency = 0.5

          if value131:IsA("BasePart") then
            value131.Material = Enum.Material.ForceField
            value131.Color = p84 or Color3.fromRGB(139, 69, 19)
            value131.CanCollide = false
            value131.Anchored = true
          end
        elseif value131:IsA("Script") or value131:IsA("LocalScript") then
          value131:Destroy()
        end
      end

      bagVisualizer.Parent = workspace
    end

    if bagVisualizer then
      bagVisualizer:PivotTo(p83)

      if humanoidRootPart32 then
        if not attReal then
          attReal = Instance.new("Attachment")
          attReal.Name = "VisualizerAttReal"
          attReal.Parent = humanoidRootPart32
        end

        local humanoidRootPart33 = bagVisualizer:FindFirstChild("HumanoidRootPart")

        if humanoidRootPart33 then
          if not attVisual then
            attVisual = Instance.new("Attachment")
            attVisual.Name = "VisualizerAttVis"
            attVisual.Parent = humanoidRootPart33
          end

          if not bagBeam then
            bagBeam = Instance.new("Beam")
            bagBeam.Name = "BagVisualizerBeam"
            bagBeam.Attachment0 = attReal
            bagBeam.Attachment1 = attVisual
            bagBeam.FaceCamera = true
            bagBeam.Width0 = 0.15
            bagBeam.Width1 = 0.15
            bagBeam.Transparency = NumberSequence.new(0.2)
            bagBeam.Parent = workspace
          end

          local v237 = bagBeam
          v237.Color = ColorSequence.new(p84 or Color3.fromRGB(139, 69, 19))
        end
      end
    end
  else
    if bagBeam then
      bagBeam:Destroy()
      bagBeam = nil
    end

    if attReal then
      attReal:Destroy()
      attReal = nil
    end

    if attVisual then
      attVisual:Destroy()
      attVisual = nil
    end

    if bagVisualizer then
      bagVisualizer:Destroy()
      bagVisualizer = nil
    end
  end
end

function getMeleeWeapon(p85)
  if T.isBuyingMelee then
    return
  end

  T.isBuyingMelee = true

  pcall(function()
    local character59 = LocalPlayer.Character
    local humanoidRootPart34 = character59 and character59:FindFirstChild("HumanoidRootPart")

    if not humanoidRootPart34 then
      T.isBuyingMelee = false
      return
    end

    if not (character59:FindFirstChild(p85) or LocalPlayer.Backpack:FindFirstChild(p85)) then
      local v238 = findShopItem(p85)

      if v238 and v238:FindFirstChild("Head") and v238:FindFirstChild("ClickDetector") then
        humanoidRootPart34.CFrame = v238.Head.CFrame
        task.wait(0.3)
        fireclickdetector(v238.ClickDetector)
        local v239 = tick()

        while tick() - v239 < 1.5 do
          if character59:FindFirstChild(p85) or LocalPlayer.Backpack:FindFirstChild(p85) then
            break
          end

          task.wait(0.05)
        end

        task.wait(0.25)
      end
    end
  end)

  T.isBuyingMelee = false
end

Target:AddToggle("BringEnabled", {
  Text = "Bring",
  Default = false,
  Keybind = Enum.KeyCode.Unknown,
  Callback = function(value132)
    T.BringEnabled = value132
    local humanoidRootPart35

    if value132 then
      local humanoidRootPart36 = LocalPlayer.Character
        and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

      if humanoidRootPart36 then
        T.bringStartPosition = humanoidRootPart36.CFrame
      end

      Notify("Bring Script Active", 2)
      _G.MyActiveAction = "Bring Core Loop"

      T.lastGrabAttempt = 0

      T.BringLoop = RunService.Heartbeat:Connect(function()
        local humanoidRootPart37

        if not T.BringEnabled then
          if T.BringLoop then
            T.BringLoop:Disconnect()
            T.BringLoop = nil
          end

          return
        else
          local v240 = findTargetPlayer(T.TargetPlayerInput)
          local character60 = LocalPlayer.Character
          humanoidRootPart37 = character60 and character60:FindFirstChild("HumanoidRootPart")

          local humanoid44 = character60
          humanoid44 = character60 and character60:FindFirstChildOfClass("Humanoid")

          local v241 = not v240
          local v242 = humanoid44

          if v241 or not humanoidRootPart37 or not v242 then
            pcall(function() sethiddenproperty(humanoidRootPart37, "PhysicsRepRootPart", nil) end)
            return
          else
            local character61 = v240.Character

            local humanoidRootPart38 = character61
              and character61:FindFirstChild("HumanoidRootPart")

            local humanoid45 = character61
            humanoid45 = character61 and character61:FindFirstChildOfClass("Humanoid")

            local v243 = not humanoidRootPart38
            local v244 = humanoid45

            if v243 or not v244 then
              pcall(function()
                sethiddenproperty(humanoidRootPart37, "PhysicsRepRootPart", nil)
              end)

              return
            end

            if character61:FindFirstChild("GRABBING_CONSTRAINT")
              or character60:FindFirstChild("GRABBING_CONSTRAINT") then
              _G.MyActiveAction = "Target Grabbed - Returning"

              pcall(function()
                sethiddenproperty(humanoidRootPart37, "PhysicsRepRootPart", nil)
              end)

              if T.bringStartPosition then
                humanoidRootPart37.CFrame = T.bringStartPosition
              end

              humanoidRootPart37.AssemblyLinearVelocity = Vector3.zero
              T.BringEnabled = false

              if T.BringLoop then
                T.BringLoop:Disconnect()
                T.BringLoop = nil
              end

              Notify("Target Brought Successfully!", 2)
              return
            else
              local bodyEffects15 = character61:FindFirstChild("BodyEffects")

              local sdeath3 = bodyEffects15 and bodyEffects15:FindFirstChild("SDeath")
                and bodyEffects15.SDeath.Value == true

              local kO10 = bodyEffects15
                and (bodyEffects15:FindFirstChild("K.O") and bodyEffects15["K.O"].Value == true
                  or bodyEffects15:FindFirstChild("KO") and bodyEffects15.KO.Value == true)

              local forceField3 = character61:FindFirstChildOfClass("ForceField")

              if sdeath3 or v244.Health <= 0 then
                _G.MyActiveAction = "Target Dead"

                pcall(function()
                  sethiddenproperty(humanoidRootPart37, "PhysicsRepRootPart", nil)
                end)

                return
              end

              if not (character60:FindFirstChild(_G.SelectedMelee)
                  or LocalPlayer.Backpack:FindFirstChild(_G.SelectedMelee))
                and not kO10 then
                _G.MyActiveAction = "Buying Melee for Bring"

                pcall(function()
                  sethiddenproperty(humanoidRootPart37, "PhysicsRepRootPart", nil)
                end)

                getMeleeWeapon(_G.SelectedMelee)
                return
              elseif kO10 then
                _G.MyActiveAction = "Grabbing Target"

                local upperTorso7 = character61:FindFirstChild("UpperTorso")
                  or humanoidRootPart38

                sethiddenproperty(humanoidRootPart37, "PhysicsRepRootPart", upperTorso7)

                humanoidRootPart37.AssemblyLinearVelocity = Vector3.zero

                humanoidRootPart37.CFrame = CFrame.new(upperTorso7.Position
                  + Vector3.new(0, 2, 0))

                local tool7 = character60:FindFirstChildOfClass("Tool")

                if tool7 then
                  tool7.Parent = LocalPlayer.Backpack
                end

                if tick() - T.lastGrabAttempt >= 0.3 then
                  T.lastGrabAttempt = tick()
                  ReplicatedStorage.MainEvent:FireServer("Grabbing", false)
                end

                return
              elseif forceField3 then
                _G.MyActiveAction = "Target Have FF (Waiting)"

                pcall(function()
                  sethiddenproperty(humanoidRootPart37, "PhysicsRepRootPart", nil)
                end)

                humanoidRootPart37.CFrame = VoidCFrame
                humanoidRootPart37.AssemblyLinearVelocity = Vector3.zero

                return
              else
                _G.MyActiveAction = "Knocking Target for Bring"
                equipTool(T.SelectedMelee)
                local findFirstChild10 = character60:FindFirstChild(T.SelectedMelee)

                if findFirstChild10 then
                  sethiddenproperty(
                    humanoidRootPart37, "PhysicsRepRootPart", humanoidRootPart38
                  )

                  local vector14 = Vector3.new(
                    humanoidRootPart38.Position.X, humanoidRootPart37.Position.Y,
                    humanoidRootPart38.Position.Z
                  )

                  humanoidRootPart37.CFrame = CFrame.lookAt(humanoidRootPart38.Position
                    + Vector3.new(0, -2.5, 0), vector14)

                  humanoidRootPart37.AssemblyLinearVelocity = Vector3.zero

                  findFirstChild10:Activate()
                end

                return
              end
            end
          end
        end
      end)
    else
      Notify("Bring Disabled", 1.5)
      _G.MyActiveAction = "Idle"

      if T.BringLoop then
        T.BringLoop:Disconnect()
        T.BringLoop = nil
      end

      humanoidRootPart35 = LocalPlayer.Character
        and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

      if humanoidRootPart35 then
        pcall(function() sethiddenproperty(humanoidRootPart35, "PhysicsRepRootPart", nil) end)
      end
    end
  end,
})

Target:AddToggle("MeleeAutoKillEnabled", {
  Text = "Melee Auto Kill",
  Default = false,
  Callback = function(value133)
    T.MeleeAutoKillEnabled = value133
    local humanoidRootPart39

    if value133 then
      Notify("Melee Attack Loop Active", 2)
      _G.MyActiveAction = "Melee Core Loop"

      T.MeleeKillLoop = RunService.Heartbeat:Connect(function()
        local humanoidRootPart40

        if not T.MeleeAutoKillEnabled then
          if T.MeleeKillLoop then
            T.MeleeKillLoop:Disconnect()
            T.MeleeKillLoop = nil
          end

          return
        else
          local v245 = findTargetPlayer(T.TargetPlayerInput)
          local character62 = LocalPlayer.Character
          humanoidRootPart40 = character62 and character62:FindFirstChild("HumanoidRootPart")
          local humanoid46 = character62 and character62:FindFirstChildOfClass("Humanoid")

          if not v245 or not humanoidRootPart40 or not humanoid46 then
            pcall(function() sethiddenproperty(humanoidRootPart40, "PhysicsRepRootPart", nil) end)

            if humanoidRootPart40 then
              humanoidRootPart40.CFrame = VoidCFrame
            end

            return
          else
            local character63 = v245.Character

            local humanoidRootPart41 = character63
              and character63:FindFirstChild("HumanoidRootPart")

            local humanoid47 = character63
            humanoid47 = character63 and character63:FindFirstChildOfClass("Humanoid")

            local v246 = not humanoidRootPart41
            local v247 = humanoid47

            if v246 or not v247 then
              pcall(function()
                sethiddenproperty(humanoidRootPart40, "PhysicsRepRootPart", nil)
              end)

              if humanoidRootPart40 then
                humanoidRootPart40.CFrame = VoidCFrame
              end

              return
            else
              local bodyEffects16 = character63:FindFirstChild("BodyEffects")

              local sdeath4 = bodyEffects16 and bodyEffects16:FindFirstChild("SDeath")
                and bodyEffects16.SDeath.Value == true

              local kO11 = bodyEffects16
                and (bodyEffects16:FindFirstChild("K.O") and bodyEffects16["K.O"].Value == true
                  or bodyEffects16:FindFirstChild("KO") and bodyEffects16.KO.Value == true)

              local forceField4 = character63:FindFirstChildOfClass("ForceField")

              if sdeath4 or v247.Health <= 0 then
                _G.MyActiveAction = "Target Executed (Void)"

                pcall(function()
                  sethiddenproperty(humanoidRootPart40, "PhysicsRepRootPart", nil)
                end)

                humanoidRootPart40.CFrame = VoidCFrame
                humanoidRootPart40.AssemblyLinearVelocity = Vector3.zero

                return
              end

              if not (character62:FindFirstChild(_G.SelectedMelee)
                or LocalPlayer.Backpack:FindFirstChild(_G.SelectedMelee)) then
                _G.MyActiveAction = "Buying Melee"

                pcall(function()
                  sethiddenproperty(humanoidRootPart40, "PhysicsRepRootPart", nil)
                end)

                getMeleeWeapon(_G.SelectedMelee)
                return
              end

              if kO11 and not sdeath4 then
                _G.MyActiveAction = "Stomping Target"

                local upperTorso8 = character63:FindFirstChild("UpperTorso")
                  or character63:FindFirstChild("LowerTorso") or humanoidRootPart41

                sethiddenproperty(humanoidRootPart40, "PhysicsRepRootPart", upperTorso8)

                humanoidRootPart40.AssemblyLinearVelocity = Vector3.zero

                humanoidRootPart40.CFrame = CFrame.new(upperTorso8.Position)
                  * CFrame.Angles(0, math.rad(tick() * 360), 0)

                local tool8 = character62:FindFirstChildOfClass("Tool")

                if tool8 then
                  tool8.Parent = LocalPlayer.Backpack
                end

                ReplicatedStorage.MainEvent:FireServer("Stomp")
                return
              elseif forceField4 then
                _G.MyActiveAction = "Target Have FF(Waiting)"

                pcall(function()
                  sethiddenproperty(humanoidRootPart40, "PhysicsRepRootPart", nil)
                end)

                humanoidRootPart40.CFrame = VoidCFrame
                humanoidRootPart40.AssemblyLinearVelocity = Vector3.zero

                return
              else
                _G.MyActiveAction = "Killing Target (" .. T.AttackMode .. ")"
                equipTool(T.SelectedMelee)
                local findFirstChild11 = character62:FindFirstChild(T.SelectedMelee)

                if findFirstChild11 then
                  if T.AttackMode == "Hide Heavy Punch" then
                    local v248 = nil

                    for index87, value134 in ipairs(humanoid46:GetPlayingAnimationTracks()) do
                      if value134.Animation and value134.Animation.AnimationId == TargetHeavyID then
                        v248 = value134
                        break
                      end
                    end

                    if v248 then
                      local timePosition = v248.TimePosition

                      if timePosition >= HitFrameSeconds
                        and timePosition <= HitFrameSeconds + StrikeBuffer then
                        sethiddenproperty(
                          humanoidRootPart40, "PhysicsRepRootPart", humanoidRootPart41
                        )

                        local vector15 = Vector3.new(
                          humanoidRootPart41.Position.X, humanoidRootPart40.Position.Y,
                          humanoidRootPart41.Position.Z
                        )

                        humanoidRootPart40.CFrame = CFrame.lookAt(humanoidRootPart41.Position
                          + Vector3.new(0, -2.5, 0), vector15)

                        humanoidRootPart40.AssemblyLinearVelocity = Vector3.zero
                      else
                        pcall(function()
                          sethiddenproperty(humanoidRootPart40, "PhysicsRepRootPart", nil)
                        end)

                        humanoidRootPart40.CFrame = VoidCFrame
                        humanoidRootPart40.AssemblyLinearVelocity = Vector3.zero
                      end
                    else
                      pcall(function()
                        sethiddenproperty(humanoidRootPart40, "PhysicsRepRootPart", nil)
                      end)

                      humanoidRootPart40.CFrame = VoidCFrame
                      humanoidRootPart40.AssemblyLinearVelocity = Vector3.zero

                      findFirstChild11:Activate()
                    end
                  else
                    sethiddenproperty(
                      humanoidRootPart40, "PhysicsRepRootPart", humanoidRootPart41
                    )

                    local vector16 = Vector3.new(
                      humanoidRootPart41.Position.X, humanoidRootPart40.Position.Y,
                      humanoidRootPart41.Position.Z
                    )

                    humanoidRootPart40.CFrame = CFrame.lookAt(humanoidRootPart41.Position
                      + Vector3.new(0, -2.5, 0), vector16)

                    humanoidRootPart40.AssemblyLinearVelocity = Vector3.zero

                    findFirstChild11:Activate()
                  end
                end

                return
              end
            end
          end
        end
      end)
    else
      Notify("Melee Auto Kill Disabled", 1.5)
      _G.MyActiveAction = "Idle"

      if T.MeleeKillLoop then
        T.MeleeKillLoop:Disconnect()
        T.MeleeKillLoop = nil
      end

      humanoidRootPart39 = LocalPlayer.Character
        and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

      if humanoidRootPart39 then
        pcall(function() sethiddenproperty(humanoidRootPart39, "PhysicsRepRootPart", nil) end)
      end
    end
  end,
})

Target:AddSlider("GunVelocityPrediction", {
  Text = "Gun Velocity Prediction",
  Min = 0,
  Max = 15,
  Default = 1,
  Rounding = 1,
  Callback = function(value135) T.GunVelocityPrediction = tonumber(value135) or 5 end,
})

Target:AddToggle("GunAutoKillEnabled", {
  Text = "Gun Auto Kill (Detected)",
  Default = false,
  Callback = function(value136)
    T.GunAutoKillEnabled = value136
    local humanoidRootPart42, f30, f31, f32, f33, f34, v249

    if value136 then
      Notify("Gun Auto Kill Active", 2)
      _G.MyActiveAction = "Gun Core Loop"

      function f30(index88, p86)
        if not index88 then
          return
        else
          local character64 = LocalPlayer.Character

          local humanoidRootPart43 = character64
            and character64:FindFirstChild("HumanoidRootPart")

          if not humanoidRootPart43 then
            return
          else
            local findFirstChildWhichIsA4 = index88:FindFirstChildWhichIsA(
              "ClickDetector", true
            )

            if not findFirstChildWhichIsA4 then
              return
            end

            humanoidRootPart43.CFrame = index88:GetPivot() + Vector3.new(0, 3, 0)
            task.wait(0.2)

            for i9 = 1, p86 or 1 do
              if not T.GunAutoKillEnabled then
                break
              end

              fireclickdetector(findFirstChildWhichIsA4)
              task.wait(0.15)
            end

            task.wait(0.15)
            return
          end
        end
      end

      function f31()
        local backpack4 = LocalPlayer.Backpack
        local rifle = backpack4
        local character65 = LocalPlayer.Character

        if backpack4 then
          rifle = backpack4:FindFirstChild("[Rifle]") or backpack4:FindFirstChild("Rifle")
        end

        if rifle then
          return true
        end

        if character65
          and (character65:FindFirstChild("[Rifle]") or character65:FindFirstChild("Rifle")) then
          return true
        end

        return false
      end

      function f32()
        T.buyingGunsState = true
        local rifle2 = findShopItem("Rifle]")
        local rifleAmmo = findShopItem("Rifle Ammo]")

        if not f31() then
          _G.MyActiveAction = "Buying Rifle"
          Notify("Buying Rifle...", 2)

          if rifle2 then
            for i10 = 1, 10 do
              if not T.GunAutoKillEnabled then
                T.buyingGunsState = false
                return
              end

              if f31() then
                break
              end

              f30(rifle2, 1)
              task.wait(0.2)
            end
          end

          _G.MyActiveAction = "Buying Rifle Ammo x4"

          if rifleAmmo then
            f30(rifleAmmo, 4)
          end

          T.buyingGunsState = false
          return
        end

        T.buyingGunsState = false
      end

      function f33()
        local character66 = LocalPlayer.Character
        local v250 = not character66
        local backpack5 = LocalPlayer.Backpack

        if v250 or not backpack5 then
          return
        else
          local rifle3 = backpack5:FindFirstChild("[Rifle]")
            or character66:FindFirstChild("[Rifle]")

          if rifle3 and rifle3:IsA("Tool") then
            if rifle3.Parent ~= character66 then
              rifle3.Parent = character66
            end
          end

          return
        end
      end

      function f34()
        local character67 = LocalPlayer.Character
        local v251 = not character67
        local backpack6 = LocalPlayer.Backpack

        if v251 or not backpack6 then
          return
        end

        if character67:FindFirstChild("[Rifle]") or character67:FindFirstChild("Rifle") then
          return
        else
          local rifle4 = backpack6:FindFirstChild("[Rifle]")
            or backpack6:FindFirstChild("Rifle")

          if rifle4 and rifle4:IsA("Tool") then
            rifle4.Parent = character67
          end

          return
        end
      end

      task.spawn(function()
        f32()
        f33()
        _G.MyActiveAction = "Gun Core Loop"
        Notify("Rifle equipped, starting kill loop", 2)
      end)

      v249 = false

      T.GunKillLoop = RunService.Heartbeat:Connect(function()
        local humanoidRootPart44, humanoidRootPart45

        if not T.GunAutoKillEnabled then
          if T.GunKillLoop then
            T.GunKillLoop:Disconnect()
            T.GunKillLoop = nil
          end

          return
        elseif T.buyingGunsState then
          return
        else
          f34()
          local character68 = LocalPlayer.Character
          humanoidRootPart44 = character68 and character68:FindFirstChild("HumanoidRootPart")

          local humanoid48 = character68
          humanoid48 = character68 and character68:FindFirstChildOfClass("Humanoid")

          if not humanoidRootPart44 or not humanoid48 then
            return
          else
            local v252 = findTargetPlayer(T.TargetPlayerInput)

            if not v252 then
              pcall(function()
                sethiddenproperty(humanoidRootPart44, "PhysicsRepRootPart", nil)
              end)

              return
            else
              local character69 = v252.Character

              humanoidRootPart45 = character69
                and character69:FindFirstChild("HumanoidRootPart")

              local humanoid49 = character69
              humanoid49 = character69 and character69:FindFirstChildOfClass("Humanoid")

              local v253 = not humanoidRootPart45
              local v254 = humanoid49

              if v253 or not v254 then
                pcall(function()
                  sethiddenproperty(humanoidRootPart44, "PhysicsRepRootPart", nil)
                end)

                return
              else
                local bodyEffects17 = character69:FindFirstChild("BodyEffects")

                local sdeath5 = bodyEffects17 and bodyEffects17:FindFirstChild("SDeath")
                  and bodyEffects17.SDeath.Value == true

                local kO12 = bodyEffects17
                  and (bodyEffects17:FindFirstChild("K.O") and bodyEffects17["K.O"].Value == true
                    or bodyEffects17:FindFirstChild("KO") and bodyEffects17.KO.Value == true)

                local forceField5 = character69:FindFirstChildOfClass("ForceField")
                local v255 = {}

                for index89, value137 in ipairs(character68:GetChildren()) do
                  if value137:IsA("Tool") and value137:FindFirstChild("Handle") then
                    if value137:FindFirstChild("Ammo") then
                      table.insert(v255, value137)
                    end
                  end
                end

                if sdeath5 or v254.Health <= 0 then
                  _G.MyActiveAction = "Target Executed (Void)"
                  local cframe8 = humanoidRootPart44.CFrame
                  local assemblyLinearVelocity3 = humanoidRootPart44.AssemblyLinearVelocity
                  local assemblyAngularVelocity2 = humanoidRootPart44.AssemblyAngularVelocity

                  pcall(function()
                    sethiddenproperty(humanoidRootPart44, "PhysicsRepRootPart", nil)
                  end)

                  humanoidRootPart44.CFrame = VoidCFrame
                  humanoidRootPart44.AssemblyLinearVelocity = Vector3.zero
                  humanoidRootPart44.AssemblyAngularVelocity = Vector3.zero

                  if #v255 > 0 and not v249 then
                    local mainEvent2 = ReplicatedStorage:FindFirstChild("MainEvent")

                    if mainEvent2 then
                      for index90, value138 in ipairs(v255) do
                        mainEvent2:FireServer("Reload", value138)
                      end

                      v249 = true
                    end
                  end

                  RunService.RenderStepped:Wait()

                  humanoidRootPart44.CFrame = cframe8
                  humanoidRootPart44.AssemblyLinearVelocity = assemblyLinearVelocity3
                  humanoidRootPart44.AssemblyAngularVelocity = assemblyAngularVelocity2

                  return
                end

                v249 = false

                if forceField5 then
                  _G.MyActiveAction = "Target Have FF (Waiting)"

                  pcall(function()
                    sethiddenproperty(humanoidRootPart44, "PhysicsRepRootPart", nil)
                  end)

                  local cframe9 = humanoidRootPart44.CFrame

                  humanoidRootPart44.CFrame = VoidCFrame
                  humanoidRootPart44.AssemblyLinearVelocity = Vector3.zero
                  humanoidRootPart44.AssemblyAngularVelocity = Vector3.zero

                  RunService.RenderStepped:Wait()
                  humanoidRootPart44.CFrame = cframe9
                  return
                end

                if kO12 and not sdeath5 then
                  _G.MyActiveAction = "Stomping Target"
                  local cframe10 = humanoidRootPart44.CFrame
                  local assemblyLinearVelocity4 = humanoidRootPart44.AssemblyLinearVelocity
                  local assemblyAngularVelocity3 = humanoidRootPart44.AssemblyAngularVelocity

                  local upperTorso9 = character69:FindFirstChild("UpperTorso")
                    or character69:FindFirstChild("LowerTorso") or humanoidRootPart45

                  humanoidRootPart44.AssemblyLinearVelocity = Vector3.zero
                  humanoidRootPart44.AssemblyAngularVelocity = Vector3.zero

                  humanoidRootPart44.CFrame = CFrame.new(upperTorso9.Position
                      + Vector3.new(0, 2.9, 0))
                    * CFrame.Angles(0, math.rad(tick() * 360), 0)

                  ReplicatedStorage.MainEvent:FireServer("Stomp")
                  RunService.RenderStepped:Wait()

                  humanoidRootPart44.CFrame = cframe10
                  humanoidRootPart44.AssemblyLinearVelocity = assemblyLinearVelocity4
                  humanoidRootPart44.AssemblyAngularVelocity = assemblyAngularVelocity3

                  return
                elseif #v255 == 0 then
                  _G.MyActiveAction = "Equip Rifle"

                  pcall(function()
                    sethiddenproperty(humanoidRootPart44, "PhysicsRepRootPart", nil)
                  end)

                  if tick() - T.lastGunNotificationTime > 4 then
                    Notify("Please equip [Rifle] first", 2)
                    T.lastGunNotificationTime = tick()
                  end

                  return
                else
                  _G.MyActiveAction = "Shooting Target (Beneath)"
                  local gunVelocityPrediction = T.GunVelocityPrediction or 5

                  local t = T
                  t.LastPositions = T.LastPositions or {}

                  local t2 = T
                  t2.LastTimes = T.LastTimes or {}

                  local upperTorso10 = character69:FindFirstChild("UpperTorso")

                  local torso = upperTorso10

                  torso = upperTorso10 or character69:FindFirstChild("Torso")
                    or humanoidRootPart45

                  local v256 = tick()
                  local zero = Vector3.zero
                  local v257 = T.LastPositions[v252.UserId]
                  local v258 = T.LastTimes[v252.UserId]

                  if v257 and v258 then
                    local v259 = v256 - v258

                    if v259 > 0 then
                      local v260 = (torso.Position - v257) / v259

                      if v260.Magnitude < 1000 then
                        zero = v260 * gunVelocityPrediction
                      else
                        zero = torso.Velocity * gunVelocityPrediction
                      end
                    end
                  else
                    zero = torso.Velocity * gunVelocityPrediction
                  end

                  T.LastPositions[v252.UserId] = torso.Position
                  T.LastTimes[v252.UserId] = v256

                  local cframe11 = humanoidRootPart44.CFrame
                  local assemblyLinearVelocity5 = humanoidRootPart44.AssemblyLinearVelocity
                  local assemblyAngularVelocity4 = humanoidRootPart44.AssemblyAngularVelocity

                  pcall(function()
                    sethiddenproperty(
                      humanoidRootPart44, "PhysicsRepRootPart", humanoidRootPart45
                    )
                  end)

                  humanoidRootPart44.AssemblyLinearVelocity = Vector3.zero
                  humanoidRootPart44.AssemblyAngularVelocity = Vector3.zero

                  humanoidRootPart44.CFrame = CFrame.new(humanoidRootPart45.Position
                    - Vector3.new(0, 7, 0))

                  local mainEvent3 = ReplicatedStorage:FindFirstChild("MainEvent")

                  if mainEvent3 then
                    local head5 = character69:FindFirstChild("Head")

                    local v261 = head5 and head5.Position + zero
                      or humanoidRootPart45.Position + zero

                    for index91, value139 in ipairs(v255) do
                      if value139.Handle then
                        mainEvent3:FireServer(
                          "ShootGun", value139.Handle, value139.Handle.CFrame.Position, v261,
                          head5 or humanoidRootPart45, Vector3.new(0, 0, -1)
                        )
                      end
                    end
                  end

                  RunService.RenderStepped:Wait()

                  humanoidRootPart44.CFrame = cframe11
                  humanoidRootPart44.AssemblyLinearVelocity = assemblyLinearVelocity5
                  humanoidRootPart44.AssemblyAngularVelocity = assemblyAngularVelocity4

                  return
                end
              end
            end
          end
        end
      end)
    else
      Notify("Gun Auto Kill Disabled", 1.5)
      _G.MyActiveAction = "Idle"
      T.buyingGunsState = false

      if T.GunKillLoop then
        T.GunKillLoop:Disconnect()
        T.GunKillLoop = nil
      end

      humanoidRootPart42 = LocalPlayer.Character
        and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")

      if humanoidRootPart42 then
        pcall(function() sethiddenproperty(humanoidRootPart42, "PhysicsRepRootPart", nil) end)
      end
    end
  end,
})

Target:AddToggle("GunAutoKillHookEnabled", {
  Text = "Gun Auto Kill (Hook Method)",
  Default = false,
  Callback = function(value140)
    T.GunAutoKillHookEnabled = value140
    local f35, v262

    if value140 then
      Notify("Gun Auto Kill (Hook Method) Active", 2)
      _G.MyActiveAction = "Gun Hook Loop"

      local t3 = T
      t3.GunHook = T.GunHook or {}

      T.GunHook.lockedPart = nil

      if T.GunHook.checkWalls == nil then
        T.GunHook.checkWalls = false
      end

      if T.GunHook.aboveHeight == nil then
        T.GunHook.aboveHeight = 5
      end

      function f35(p87)
        if not T.GunHook.checkWalls then
          return true
        end

        if not Camera2 or not p87 then
          return false
        else
          local tool9 = LocalPlayer.Character
            and LocalPlayer.Character:FindFirstChildWhichIsA("Tool")

          local position7 = tool9 and tool9:FindFirstChild("Handle") and tool9.Handle.Position
            or Camera2.CFrame.Position

          local raycastParams3 = RaycastParams.new()
          raycastParams3.FilterType = Enum.RaycastFilterType.Exclude
          raycastParams3.FilterDescendantsInstances = { LocalPlayer.Character, Camera2 }
          raycastParams3.IgnoreWater = true

          local raycast3 = workspace:Raycast(
            position7, p87.Position - position7, raycastParams3
          )

          if not raycast3 then
            return true
          end

          return raycast3.Instance:IsDescendantOf(p87.Parent)
        end
      end

      if T.GunHook.watchdog then
        pcall(function() task.cancel(T.GunHook.watchdog) end)
        T.GunHook.watchdog = nil
      end

      T.GunHook.watchdog = task.spawn(function()
        while T.GunAutoKillHookEnabled do
          task.wait(2)

          if not T.GunAutoKillHookEnabled then
            break
          end
        end
      end)

      v262 = false

      T.GunHookLoop = RunService.Heartbeat:Connect(function()
        local humanoidRootPart46, v263, mainEvent4

        if not T.GunAutoKillHookEnabled then
          if T.GunHookLoop then
            T.GunHookLoop:Disconnect()
            T.GunHookLoop = nil
          end

          T.GunHook.lockedPart = nil
          return
        else
          local character70 = LocalPlayer.Character
          humanoidRootPart46 = character70 and character70:FindFirstChild("HumanoidRootPart")
          local humanoid50 = character70 and character70:FindFirstChildOfClass("Humanoid")

          if not character70 or not humanoidRootPart46 or not humanoid50 then
            T.GunHook.lockedPart = nil
            return
          else
            local v264 = findTargetPlayer(T.TargetPlayerInput)

            if not v264 then
              T.GunHook.lockedPart = nil
              _G.MyActiveAction = "Gun Hook: No Target"
              return
            else
              local character71 = v264.Character
              local humanoid51 = character71 and character71:FindFirstChildOfClass("Humanoid")
              local head6 = character71 and character71:FindFirstChild("Head")

              local humanoidRootPart47 = character71

              humanoidRootPart47 = character71
                and character71:FindFirstChild("HumanoidRootPart")

              local v265 = not humanoid51
              v263 = humanoidRootPart47

              if v265 or not head6 or not v263 then
                T.GunHook.lockedPart = nil
                _G.MyActiveAction = "Gun Hook: Target Gone"
                return
              else
                local bodyEffects18 = character71:FindFirstChild("BodyEffects")

                local sdeath6 = bodyEffects18 and bodyEffects18:FindFirstChild("SDeath")
                  and bodyEffects18.SDeath.Value == true

                local kO13 = bodyEffects18
                  and (bodyEffects18:FindFirstChild("K.O") and bodyEffects18["K.O"].Value == true
                    or bodyEffects18:FindFirstChild("KO") and bodyEffects18.KO.Value == true)

                local forceField6 = character71:FindFirstChildOfClass("ForceField")

                if sdeath6 or humanoid51.Health <= 0 then
                  T.GunHook.lockedPart = nil
                  _G.MyActiveAction = "Gun Hook: Target Dead"

                  if not v262 then
                    mainEvent4 = ReplicatedStorage:FindFirstChild("MainEvent")

                    if mainEvent4 then
                      for index92, value141 in ipairs(character70:GetChildren()) do
                        local v266 = value141

                        if v266:IsA("Tool") and v266:FindFirstChild("Ammo") then
                          pcall(function() mainEvent4:FireServer("Reload", v266) end)
                        end
                      end
                    end

                    v262 = true
                  end

                  local cframe12 = humanoidRootPart46.CFrame
                  local assemblyLinearVelocity6 = humanoidRootPart46.AssemblyLinearVelocity
                  local assemblyAngularVelocity5 = humanoidRootPart46.AssemblyAngularVelocity

                  pcall(function()
                    sethiddenproperty(humanoidRootPart46, "PhysicsRepRootPart", nil)
                  end)

                  humanoidRootPart46.CFrame = VoidCFrame
                  humanoidRootPart46.AssemblyLinearVelocity = Vector3.zero
                  humanoidRootPart46.AssemblyAngularVelocity = Vector3.zero

                  RunService.RenderStepped:Wait()

                  humanoidRootPart46.CFrame = cframe12
                  humanoidRootPart46.AssemblyLinearVelocity = assemblyLinearVelocity6
                  humanoidRootPart46.AssemblyAngularVelocity = assemblyAngularVelocity5

                  return
                end

                v262 = false

                if forceField6 then
                  T.GunHook.lockedPart = nil
                  _G.MyActiveAction = "Gun Hook: Target Has FF"
                  local cframe13 = humanoidRootPart46.CFrame

                  pcall(function()
                    sethiddenproperty(humanoidRootPart46, "PhysicsRepRootPart", nil)
                  end)

                  humanoidRootPart46.CFrame = VoidCFrame
                  humanoidRootPart46.AssemblyLinearVelocity = Vector3.zero
                  humanoidRootPart46.AssemblyAngularVelocity = Vector3.zero

                  RunService.RenderStepped:Wait()
                  humanoidRootPart46.CFrame = cframe13
                  return
                elseif kO13 then
                  T.GunHook.lockedPart = nil
                  _G.MyActiveAction = "Gun Hook: Target K.O (In Void)"
                  local cframe14 = humanoidRootPart46.CFrame
                  local assemblyLinearVelocity7 = humanoidRootPart46.AssemblyLinearVelocity
                  local assemblyAngularVelocity6 = humanoidRootPart46.AssemblyAngularVelocity

                  pcall(function()
                    sethiddenproperty(humanoidRootPart46, "PhysicsRepRootPart", nil)
                  end)

                  humanoidRootPart46.CFrame = VoidCFrame
                  humanoidRootPart46.AssemblyLinearVelocity = Vector3.zero
                  humanoidRootPart46.AssemblyAngularVelocity = Vector3.zero

                  RunService.RenderStepped:Wait()

                  humanoidRootPart46.CFrame = cframe14
                  humanoidRootPart46.AssemblyLinearVelocity = assemblyLinearVelocity7
                  humanoidRootPart46.AssemblyAngularVelocity = assemblyAngularVelocity6

                  return
                elseif not f35(head6) then
                  T.GunHook.lockedPart = nil
                  _G.MyActiveAction = "Gun Hook: Target Behind Wall"
                  return
                else
                  T.GunHook.lockedPart = head6
                  local v267 = false

                  for index93, value142 in ipairs(character70:GetChildren()) do
                    if value142:IsA("Tool") and value142:FindFirstChild("Handle")
                      and value142:FindFirstChild("Ammo") then
                      v267 = true
                      break
                    end
                  end

                  if v267 then
                    _G.MyActiveAction = "Gun Hook: Above + Shooting"
                    local aboveHeight = T.GunHook.aboveHeight
                    local cframe15 = humanoidRootPart46.CFrame
                    local assemblyLinearVelocity8 = humanoidRootPart46.AssemblyLinearVelocity
                    local assemblyAngularVelocity7 = humanoidRootPart46.AssemblyAngularVelocity

                    pcall(function()
                      sethiddenproperty(humanoidRootPart46, "PhysicsRepRootPart", v263)
                    end)

                    humanoidRootPart46.AssemblyLinearVelocity = Vector3.zero
                    humanoidRootPart46.AssemblyAngularVelocity = Vector3.zero

                    humanoidRootPart46.CFrame = CFrame.new(v263.Position
                      + Vector3.new(0, aboveHeight or 5, 0))

                    for index94, value143 in ipairs(character70:GetChildren()) do
                      local v268 = value143

                      if v268:IsA("Tool") and v268:FindFirstChild("Handle")
                        and v268:FindFirstChild("Ammo") then
                        pcall(function() v268:Activate() end)
                      end
                    end

                    RunService.RenderStepped:Wait()

                    humanoidRootPart46.CFrame = cframe15
                    humanoidRootPart46.AssemblyLinearVelocity = assemblyLinearVelocity8
                    humanoidRootPart46.AssemblyAngularVelocity = assemblyAngularVelocity7
                  else
                    _G.MyActiveAction = "Gun Hook: No Gun Equipped"
                    T.GunHook.lockedPart = nil

                    if tick() - (T.lastGunNotificationTime or 0) > 4 then
                      Notify("Please equip a gun first", 2)
                      T.lastGunNotificationTime = tick()
                    end
                  end

                  return
                end
              end
            end
          end
        end
      end)
    else
      Notify("Gun Auto Kill (Hook Method) Disabled", 1.5)
      _G.MyActiveAction = "Idle"

      local t4 = T
      t4.GunHook = T.GunHook or {}

      T.GunHook.lockedPart = nil

      if T.GunHookLoop then
        T.GunHookLoop:Disconnect()
        T.GunHookLoop = nil
      end

      if T.GunHook.watchdog then
        pcall(function() task.cancel(T.GunHook.watchdog) end)
        T.GunHook.watchdog = nil
      end
    end
  end,
})

Target:AddToggle("AutoAmmoEnabled", {
  Text = "Auto Ammo",
  Default = false,
  Callback = function(value144)
    T.AutoAmmoEnabled = value144

    Notify(
      value144 and "Auto Ammo Engine Enabled" or "Auto Ammo Engine Disabled",
      value144 and 2 or 1.5
    )
  end,
})

Target:AddDropdown("AttackMode", {
  Text = "Attack Mode",
  Values = { "Hide Heavy Punch", "Normal Track" },
  Default = "Hide Heavy Punch",
  Callback = function(value145)
    T.AttackMode = value145
    Notify("Attack Style: " .. value145, 1.5)
  end,
})

Target:AddDropdown("SelectedMelee", {
  Text = "Select Melee Weapon",
  Values = { "[Knife]", "[StopSign]", "[SledgeHammer]", "[Shovel]", "[Pitchfork]" },
  Default = "[Knife]",
  Callback = function(value146)
    _G.SelectedMelee = value146
    T.SelectedMelee = value146
    Notify("Selected Melee: " .. value146, 1.5)

    pcall(function()
      local character72 = LocalPlayer.Character
      local backpack7 = LocalPlayer.Backpack

      for index95, value147 in ipairs({
        "[Knife]", "[StopSign]", "[SledgeHammer]", "[Shovel]", "[Pitchfork]",
      }) do
        if value147 ~= value146 then
          local findFirstChild12 = backpack7:FindFirstChild(value147)
          local findFirstChild13 = character72:FindFirstChild(value147)

          if findFirstChild12 then
            findFirstChild12:Destroy()
          end

          if findFirstChild13 then
            findFirstChild13:Destroy()
          end
        end
      end
    end)
  end,
})

if getgenv().SkidoESP and getgenv().SkidoESP.Destroy then
  pcall(function() getgenv().SkidoESP.Destroy() end)
end

local localPlayer11 = players.LocalPlayer
local color6 = Color3.fromRGB(0, 255, 255)
local color7 = Color3.fromRGB(80, 220, 255)

local v269 = {
  enabled = false,
  nameOn = true,
  nameColor = color6,
  nameSize = 14,
  nameMode = "Username",
  hpOn = true,
  hpColor = Color3.fromRGB(0, 255, 0),
  hpMax = 100,
  arOn = true,
  arColor = color7,
  arMax = 130,
  distOn = true,
  distColor = color6,
  distSize = 12,
  distUnit = "studs",
  wpnOn = true,
  wpnColor = color6,
  wpnSize = 12,
  outlined = true,
  outlineColor = Color3.fromRGB(0, 20, 30),
  boxColor = color6,
  showBox = true,
  maxDistance = 5000,
  objs = {},
  conns = {},
}

getgenv().SkidoESP = v269
local skidoESPOverlay = coreGui:FindFirstChild("SkidoESP_Overlay")

if skidoESPOverlay then
  skidoESPOverlay:Destroy()
end

local skidoESPOverlay2 = localPlayer11:FindFirstChild("PlayerGui")
  and localPlayer11.PlayerGui:FindFirstChild("SkidoESP_Overlay")

if skidoESPOverlay2 then
  skidoESPOverlay2:Destroy()
end

local skidoESPOverlay3 = Instance.new("ScreenGui")
skidoESPOverlay3.Name = "SkidoESP_Overlay"
skidoESPOverlay3.ResetOnSpawn = false
skidoESPOverlay3.IgnoreGuiInset = true
skidoESPOverlay3.DisplayOrder = 99999
skidoESPOverlay3.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

if not pcall(function() skidoESPOverlay3.Parent = coreGui end) or not skidoESPOverlay3.Parent then
  skidoESPOverlay3.Parent = localPlayer11:WaitForChild("PlayerGui")
end

local function f36(key21)
  if v269.nameMode == "DisplayName" then
    return key21.DisplayName
  end

  if v269.nameMode == "Username (DisplayName)" then
    return key21.Name .. " (" .. key21.DisplayName .. ")"
  end

  return key21.Name
end

local function f37(p88)
  if not p88 then
    return
  end

  p88.TextStrokeTransparency = v269.outlined and 0 or 1
  p88.TextStrokeColor3 = v269.outlineColor
end

local function f38(key22)
  local v270 = v269.objs[key22]

  if not v270 then
    return
  end

  if v270.billboard then
    pcall(function() v270.billboard:Destroy() end)
  end

  v269.objs[key22] = nil
end

local currentCamera2 = workspace.CurrentCamera

runService.RenderStepped:Connect(function()
  if not v269.enabled then
    for key23, value148 in pairs(v269.objs) do
      if value148.billboard then
        value148.billboard.Enabled = false
      end
    end

    return
  else
    currentCamera2 = workspace.CurrentCamera
    local position8 = currentCamera2 and currentCamera2.CFrame.Position
    local character73 = localPlayer11.Character

    if not (character73 and character73:FindFirstChild("HumanoidRootPart")) or not position8 then
      for key24, value149 in pairs(v269.objs) do
        if value149.billboard then
          value149.billboard.Enabled = false
        end
      end

      return
    end

    for key25, value150 in pairs(v269.objs) do
      local character74 = key25.Character

      local head7 = character74
        and (character74:FindFirstChild("Head") or character74:FindFirstChild("HumanoidRootPart"))

      local humanoid52 = character74
      humanoid52 = character74 and character74:FindFirstChildOfClass("Humanoid")

      if key25 == localPlayer11 or not character74 or not head7 or not humanoid52
        or humanoid52.Health <= 0 then
        if value150.billboard then
          value150.billboard.Enabled = false
        end
      else
        if value150.billboard.Adornee ~= head7 or not value150.billboard.Adornee
          or not value150.billboard.Adornee.Parent then
          value150.billboard.Adornee = head7
        end

        local v271 = math.max((position8 - head7.Position).Magnitude, 1)

        if v271 > v269.maxDistance then
          value150.billboard.Enabled = false
        else
          value150.billboard.Enabled = true
          local v272 = 30 / v271
          local v273 = math.clamp(60 * v272, 20, 2000)
          local v274 = math.clamp(80 * v272, 30, 2500)

          value150.billboard.Size = UDim2.new(
            0, math.max(v273 * 4, 320), 0, math.max(v274 * 2, 240)
          )

          value150.box.AnchorPoint = Vector2.new(0.5, 0.5)
          value150.box.Position = UDim2.new(0.5, 0, 0.5, 0)
          value150.box.Size = UDim2.new(0, v273, 0, v274)
          value150.box.AnchorPoint = Vector2.new(0.5, 0.5)
          value150.nameLabel.AnchorPoint = Vector2.new(0.5, 1)
          value150.nameLabel.Size = UDim2.new(0, 300, 0, 18)
          value150.nameLabel.Position = UDim2.new(0.5, 0, 0.5, -v274 / 2 - 2)
          value150.nameLabel.TextSize = 14
          value150.nameLabel.Visible = v269.nameOn

          if v269.nameOn then
            value150.nameLabel.Text = f36(key25)
            value150.nameLabel.TextColor3 = v269.nameColor
            f37(value150.nameLabel)
          end

          value150.wpnLabel.AnchorPoint = Vector2.new(0.5, 0)
          value150.wpnLabel.Size = UDim2.new(0, 300, 0, 17)
          value150.wpnLabel.Position = UDim2.new(0.5, 0, 0.5, v274 / 2 + 2)
          value150.wpnLabel.TextSize = 13

          if v269.wpnOn then
            local tool10 = character74:FindFirstChildOfClass("Tool")

            if tool10 then
              value150.wpnLabel.Text = tool10.Name
              value150.wpnLabel.TextColor3 = v269.wpnColor
              value150.wpnLabel.Visible = true

              f37(value150.wpnLabel)
            else
              value150.wpnLabel.Visible = false
            end
          else
            value150.wpnLabel.Visible = false
          end

          value150.distLabel.AnchorPoint = Vector2.new(0.5, 0)
          value150.distLabel.Size = UDim2.new(0, 300, 0, 16)

          local distLabel = value150.distLabel
          distLabel.Position = UDim2.new(0.5, 0, 0.5, v274 / 2 + 4 + (v269.wpnOn and 19 or 0))

          value150.distLabel.TextSize = 12

          if v269.distOn then
            value150.distLabel.Text = math.floor(v271) .. " " .. v269.distUnit
            value150.distLabel.TextColor3 = v269.distColor
            value150.distLabel.Visible = true

            f37(value150.distLabel)
          else
            value150.distLabel.Visible = false
          end

          if v269.hpOn then
            local v275 = math.clamp(humanoid52.Health / math.max(humanoid52.MaxHealth, 1), 0, 1)

            value150.hpHolder.AnchorPoint = Vector2.new(1, 0.5)
            value150.hpHolder.Position = UDim2.new(0.5, -v273 / 2 - 3, 0.5, 0)
            value150.hpHolder.Size = UDim2.new(0, 4, 0, v274)
            value150.hpFill.Size = UDim2.new(1, 0, v275, 0)
            value150.hpFill.BackgroundColor3 = v269.hpColor
            value150.hpHolder.Visible = true
          else
            value150.hpHolder.Visible = false
          end

          if v269.arOn then
            local armorSave = key25:FindFirstChild("DataFolder")
              and key25.DataFolder:FindFirstChild("Information")
              and key25.DataFolder.Information:FindFirstChild("ArmorSave")

            local v276 = armorSave and (tonumber(armorSave.Value) or 0) or 0
            local v277 = math.clamp(v276 / math.max(v269.arMax, 1), 0, 1)

            value150.arHolder.AnchorPoint = Vector2.new(0, 0.5)
            value150.arHolder.Position = UDim2.new(0.5, v273 / 2 + 3, 0.5, 0)
            value150.arHolder.Size = UDim2.new(0, 4, 0, v274)
            value150.arFill.Size = UDim2.new(1, 0, v277, 0)
            value150.arFill.BackgroundColor3 = v269.arColor
            value150.arHolder.Visible = true
          else
            value150.arHolder.Visible = false
          end

          value150.box.Visible = true

          if value150.boxStroke then
            value150.boxStroke.Transparency = v269.showBox and 0 or 1
            value150.boxStroke.Color = v269.boxColor
          end
        end
      end
    end

    return
  end
end)

for index96, value151 in ipairs(players:GetPlayers()) do
end

local playerAdded = players.PlayerAdded
table.insert(v269.conns, playerAdded:Connect(function(p89) end))
local playerRemoving = players.PlayerRemoving
table.insert(v269.conns, playerRemoving:Connect(f38))

function v269.Destroy()
  for index97, value152 in ipairs(v269.conns) do
    local v278 = value152
    pcall(function() v278:Disconnect() end)
  end

  table.clear(v269.conns)

  for key26 in pairs(v269.objs) do
    f38(key26)
  end

  table.clear(v269.objs)

  if skidoESPOverlay3 then
    pcall(function() skidoESPOverlay3:Destroy() end)
  end

  if getgenv().SkidoESP == v269 then
    getgenv().SkidoESP = nil
  end
end

Visual:AddToggle("SkidoESP_Master", {
  Text = "Enable ESP",
  Default = false,
  Callback = function(value153)
    v269.enabled = value153

    if value153 then
      for index98, value154 in ipairs(players:GetPlayers()) do
      end
    end
  end,
})

Visual:AddToggle("SkidoESP_Box", {
  Text = "Box ESP",
  Default = true,
  ColorPicker = true,
  Color = v269.boxColor,
  Callback = function(value155) v269.showBox = value155 end,
  ColorCallback = function(boxColor) v269.boxColor = boxColor end,
})

Visual:AddToggle("SkidoESP_Name", {
  Text = "Name ESP",
  Default = false,
  ColorPicker = true,
  Color = v269.nameColor,
  Callback = function(value156) v269.nameOn = value156 end,
  ColorCallback = function(nameColor) v269.nameColor = nameColor end,
})

Visual:AddToggle("SkidoESP_Health", {
  Text = "Health Bar ESP",
  Default = false,
  ColorPicker = true,
  Color = v269.hpColor,
  Callback = function(value157) v269.hpOn = value157 end,
  ColorCallback = function(hpColor) v269.hpColor = hpColor end,
})

Visual:AddToggle("SkidoESP_Armor", {
  Text = "Armor Bar ESP",
  Default = false,
  ColorPicker = true,
  Color = v269.arColor,
  Callback = function(value158) v269.arOn = value158 end,
  ColorCallback = function(arColor) v269.arColor = arColor end,
})

Visual:AddToggle("SkidoESP_Distance", {
  Text = "Distance ESP",
  Default = false,
  ColorPicker = true,
  Color = v269.distColor,
  Callback = function(value159) v269.distOn = value159 end,
  ColorCallback = function(distColor) v269.distColor = distColor end,
})

Visual:AddToggle("SkidoESP_Weapon", {
  Text = "Weapon ESP",
  Default = false,
  ColorPicker = true,
  Color = v269.wpnColor,
  Callback = function(value160) v269.wpnOn = value160 end,
  ColorCallback = function(wpnColor) v269.wpnColor = wpnColor end,
})

Visual:AddToggle("SkidoESP_Outlined", {
  Text = "Text Outlined",
  Default = true,
  Callback = function(value161) v269.outlined = value161 end,
})

Visual:AddSlider("SkidoESP_MaxDist", {
  Text = "Max Render Distance",
  Min = 200,
  Max = 10000,
  Default = 5000,
  Rounding = 0,
  Callback = function(value162)
    v269.maxDistance = tonumber(value162) or 5000

    for key27, value163 in pairs(v269.objs) do
      if value163.billboard then
        value163.billboard.MaxDistance = v269.maxDistance
      end
    end
  end,
})

Visual:AddSlider("SkidoESP_NameSize", {
  Text = "Name Size",
  Min = 8,
  Max = 30,
  Default = 14,
  Rounding = 0,
  Callback = function(value164) v269.nameSize = tonumber(value164) or 14 end,
})

Visual:AddSlider("SkidoESP_DistSize", {
  Text = "Distance Size",
  Min = 8,
  Max = 24,
  Default = 12,
  Rounding = 0,
  Callback = function(value165) v269.distSize = tonumber(value165) or 12 end,
})

Visual:AddDropdown("SkidoESP_NameMode", {
  Text = "Name Display",
  Values = { "Username", "DisplayName", "Username (DisplayName)" },
  Default = "Username",
  MultiSelect = false,
  Callback = function(value166)
    v269.nameMode = type(value166) == "table" and value166[1] or value166
  end,
})

local localPlayer12 = players.LocalPlayer

local v279 = {
  Enabled = false,
  Color = Color3.fromRGB(153, 50, 204),
  Lifetime = 3,
  Texture = "rbxassetid://1390780157",
  Name = "MiseryTrail",
}

local f39

local function makeAttachment2(value167)
  local character75 = localPlayer12.Character

  if not character75 then
    return
  end

  f39(character75)

  if not value167 then
    return
  else
    local humanoidRootPart48 = character75:FindFirstChild("HumanoidRootPart")

    if not humanoidRootPart48 then
      return
    end

    for index99, value168 in ipairs(character75:GetChildren()) do
      if value168:IsA("BasePart") then
        local miseryTrailAttachment0 = Instance.new("Attachment")
        miseryTrailAttachment0.Name = "MiseryTrailAttachment0"
        miseryTrailAttachment0:SetAttribute("MiseryTrailAttachment", true)
        miseryTrailAttachment0.Parent = value168

        local miseryTrailAttachment1 = Instance.new("Attachment")
        miseryTrailAttachment1.Name = "MiseryTrailAttachment1"
        miseryTrailAttachment1:SetAttribute("MiseryTrailAttachment", true)
        miseryTrailAttachment1.Parent = humanoidRootPart48

        local trail = Instance.new("Trail")
        trail.Name = v279.Name
        trail.Texture = v279.Texture
        trail.Color = ColorSequence.new(v279.Color)
        trail.Lifetime = v279.Lifetime
        trail.Attachment0 = miseryTrailAttachment0
        trail.Attachment1 = miseryTrailAttachment1
        trail.Parent = value168
      end
    end

    return
  end
end

function f39(p90)
  if not p90 then
    return
  end

  for index100, value169 in ipairs(p90:GetDescendants()) do
    if value169:IsA("Trail") and value169.Name == v279.Name then
      value169:Destroy()
    elseif value169:IsA("Attachment") and value169:GetAttribute("MiseryTrailAttachment") then
      value169:Destroy()
    end
  end
end

Visual:AddToggle("MiseryTrail_Enabled", {
  Text = "Trail Effect",
  Default = false,
  ColorPicker = true,
  Color = v279.Color,
  Callback = function(value170)
    v279.Enabled = value170
    makeAttachment2(value170)
  end,
  ColorCallback = function(color8)
    v279.Color = color8

    if v279.Enabled then
      makeAttachment2(true)
    end
  end,
})

Visual:AddSlider("MiseryTrail_Lifetime", {
  Text = "Trail Lifespan",
  Min = 1,
  Max = 10,
  Default = v279.Lifetime,
  Rounding = 0,
  Callback = function(value171)
    v279.Lifetime = tonumber(value171) or 3

    if v279.Enabled then
      makeAttachment2(true)
    end
  end,
})

localPlayer12.CharacterAdded:Connect(function(character76)
  task.wait(1)

  if v279.Enabled and localPlayer12.Character == character76 then
    makeAttachment2(true)
  end
end)

OriginalLighting = {
  Ambient = Lighting.Ambient,
  OutdoorAmbient = Lighting.OutdoorAmbient,
  Brightness = Lighting.Brightness,
  FogStart = Lighting.FogStart,
  FogEnd = Lighting.FogEnd,
  FogColor = Lighting.FogColor,
  TimeOfDay = Lighting.TimeOfDay,
}

LState = {
  FullBright = false,
  AmbientEnabled = false,
  OutdoorAmbientEnabled = false,
  FogEnabled = false,
  AmbientColor = OriginalLighting.Ambient,
  OutdoorAmbientColor = OriginalLighting.OutdoorAmbient,
  FogColor = OriginalLighting.FogColor,
  SelectedSkybox = nil,
}

Skyboxes = {
  ["Purple Nebula"] = {
    SkyboxBk = "rbxassetid://159454299",
    SkyboxDn = "rbxassetid://159454296",
    SkyboxFt = "rbxassetid://159454293",
    SkyboxLf = "rbxassetid://159454286",
    SkyboxRt = "rbxassetid://159454300",
    SkyboxUp = "rbxassetid://159454288",
  },
  ["Night Sky"] = {
    SkyboxBk = "rbxassetid://12064107",
    SkyboxDn = "rbxassetid://12064152",
    SkyboxFt = "rbxassetid://12064121",
    SkyboxLf = "rbxassetid://12063984",
    SkyboxRt = "rbxassetid://12064115",
    SkyboxUp = "rbxassetid://12064131",
  },
  ["Pink Daylight"] = {
    SkyboxBk = "rbxassetid://271042516",
    SkyboxDn = "rbxassetid://271077243",
    SkyboxFt = "rbxassetid://271042556",
    SkyboxLf = "rbxassetid://271042310",
    SkyboxRt = "rbxassetid://271042467",
    SkyboxUp = "rbxassetid://271077958",
  },
  ["Morning Glow"] = {
    SkyboxBk = "rbxassetid://1417494030",
    SkyboxDn = "rbxassetid://1417494146",
    SkyboxFt = "rbxassetid://1417494253",
    SkyboxLf = "rbxassetid://1417494402",
    SkyboxRt = "rbxassetid://1417494499",
    SkyboxUp = "rbxassetid://1417494643",
  },
  ["Setting Sun"] = {
    SkyboxBk = "rbxassetid://626460377",
    SkyboxDn = "rbxassetid://626460216",
    SkyboxFt = "rbxassetid://626460513",
    SkyboxLf = "rbxassetid://626473032",
    SkyboxRt = "rbxassetid://626458639",
    SkyboxUp = "rbxassetid://626460625",
  },
  Cache = {
    SkyboxBk = "rbxassetid://220513302",
    SkyboxDn = "rbxassetid://213221473",
    SkyboxFt = "rbxassetid://220513328",
    SkyboxLf = "rbxassetid://220513318",
    SkyboxRt = "rbxassetid://220513279",
    SkyboxUp = "rbxassetid://220513345",
  },
  ["Fade Blue"] = {
    SkyboxBk = "rbxassetid://153695414",
    SkyboxDn = "rbxassetid://153695352",
    SkyboxFt = "rbxassetid://153695452",
    SkyboxLf = "rbxassetid://153695320",
    SkyboxRt = "rbxassetid://153695383",
    SkyboxUp = "rbxassetid://153695471",
  },
  ["Elegant Morning"] = {
    SkyboxBk = "rbxassetid://153767241",
    SkyboxDn = "rbxassetid://153767216",
    SkyboxFt = "rbxassetid://153767266",
    SkyboxLf = "rbxassetid://153767200",
    SkyboxRt = "rbxassetid://153767231",
    SkyboxUp = "rbxassetid://153767288",
  },
  Neptune = {
    SkyboxBk = "rbxassetid://218955819",
    SkyboxDn = "rbxassetid://218953419",
    SkyboxFt = "rbxassetid://218954524",
    SkyboxLf = "rbxassetid://218958493",
    SkyboxRt = "rbxassetid://218957134",
    SkyboxUp = "rbxassetid://218950090",
  },
  Redshift = {
    SkyboxBk = "rbxassetid://401664839",
    SkyboxDn = "rbxassetid://401664862",
    SkyboxFt = "rbxassetid://401664960",
    SkyboxLf = "rbxassetid://401664881",
    SkyboxRt = "rbxassetid://401664901",
    SkyboxUp = "rbxassetid://401664936",
  },
  Minecraft = {
    SkyboxBk = "rbxassetid://1876545003",
    SkyboxDn = "rbxassetid://1876544331",
    SkyboxFt = "rbxassetid://1876542941",
    SkyboxLf = "rbxassetid://1876543392",
    SkyboxRt = "rbxassetid://1876543764",
    SkyboxUp = "rbxassetid://1876544642",
  },
}

function applyFullBright()
  Lighting.FogStart = 100000
  Lighting.FogEnd = 100000
  Lighting.FogColor = Color3.new(0, 0, 0)
  Lighting.TimeOfDay = "14:00:00"

  local lighting2 = Lighting
  lighting2.Ambient = LState.AmbientEnabled and LState.AmbientColor or Color3.new(1, 1, 1)

  local lighting3 = Lighting

  lighting3.OutdoorAmbient = LState.OutdoorAmbientEnabled and LState.OutdoorAmbientColor
    or Color3.new(1, 1, 1)

  Lighting.Brightness = 2
end

function restoreDefault()
  local lighting4 = Lighting
  lighting4.FogStart = LState.FogEnabled and 100 or OriginalLighting.FogStart

  local lighting5 = Lighting
  lighting5.FogEnd = LState.FogEnabled and 500 or OriginalLighting.FogEnd

  Lighting.FogColor = OriginalLighting.FogColor
  Lighting.TimeOfDay = OriginalLighting.TimeOfDay

  local lighting6 = Lighting
  lighting6.Ambient = LState.AmbientEnabled and LState.AmbientColor or OriginalLighting.Ambient

  local lighting7 = Lighting

  lighting7.OutdoorAmbient = LState.OutdoorAmbientEnabled and LState.OutdoorAmbientColor
    or OriginalLighting.OutdoorAmbient

  Lighting.Brightness = OriginalLighting.Brightness
end

function refreshLighting()
  if LState.FullBright then
    applyFullBright()
  else
    restoreDefault()
  end
end

function applySkybox()
  local selectedSkybox = LState.SelectedSkybox and Skyboxes[LState.SelectedSkybox]

  if not selectedSkybox then
    Notify("Select a valid skybox first.", 3)
    return
  else
    for index101, value172 in ipairs(Lighting:GetChildren()) do
      if value172:IsA("Sky") and value172.Name == "CustomSky" then
        value172:Destroy()
      end
    end

    local customSky = Instance.new("Sky")
    customSky.Name = "CustomSky"

    for key28, value173 in pairs(selectedSkybox) do
      customSky[key28] = value173
    end

    customSky.Parent = Lighting
    Notify("Applied skybox: " .. LState.SelectedSkybox, 3)
    return
  end
end

function getSkyboxNames()
  local v280 = {}

  for key29 in pairs(Skyboxes) do
    table.insert(v280, key29)
  end

  table.sort(v280)
  return v280
end

Visual:AddToggle("FullBrightToggle", {
  Text = "Full Bright",
  Default = false,
  Callback = function(value174)
    LState.FullBright = value174
    refreshLighting()
  end,
})

Visual:AddToggle("AmbientToggle", {
  Text = "Ambient Color",
  Default = false,
  ColorPicker = true,
  Color = LState.AmbientColor,
  Callback = function(value175)
    LState.AmbientEnabled = value175
    refreshLighting()
  end,
  ColorCallback = function(p91)
    LState.AmbientColor = p91

    if LState.AmbientEnabled then
      Lighting.Ambient = p91
    end
  end,
})

Visual:AddToggle("OutdoorAmbientToggle", {
  Text = "Outdoor Ambient Color",
  Default = false,
  ColorPicker = true,
  Color = LState.OutdoorAmbientColor,
  Callback = function(value176)
    LState.OutdoorAmbientEnabled = value176
    refreshLighting()
  end,
  ColorCallback = function(p92)
    LState.OutdoorAmbientColor = p92

    if LState.OutdoorAmbientEnabled then
      Lighting.OutdoorAmbient = p92
    end
  end,
})

Visual:AddToggle("FogToggle", {
  Text = "Custom Fog",
  Default = false,
  ColorPicker = true,
  Color = LState.FogColor,
  Callback = function(value177)
    LState.FogEnabled = value177
    refreshLighting()

    if value177 and not LState.FullBright then
      Lighting.FogStart = 100
      Lighting.FogEnd = 500
      Lighting.FogColor = LState.FogColor
    end
  end,
  ColorCallback = function(fogColor)
    LState.FogColor = fogColor

    if LState.FogEnabled and not LState.FullBright then
      Lighting.FogColor = fogColor
    end
  end,
})

Visual:AddDropdown("SkyboxList", {
  Text = "Select Skybox",
  Values = getSkyboxNames(),
  Default = "Purple Nebula",
  Callback = function(value178)
    local lstate = LState
    lstate.SelectedSkybox = type(value178) == "table" and value178[1] or value178
  end,
})

Visual:addButton("Apply Sky", applySkybox)

Visual:addButton("Restore Default Lighting", function()
  LState.FullBright = false
  LState.AmbientEnabled = false
  LState.OutdoorAmbientEnabled = false
  LState.FogEnabled = false

  refreshLighting()
  Notify("Default lighting restored.", 3)
end)

Visual:addButton("Restore Original Skybox", function()
  for index102, value179 in ipairs(Lighting:GetChildren()) do
    if value179:IsA("Sky") and value179.Name == "CustomSky" then
      value179:Destroy()
    end
  end

  Notify("Custom skybox removed.", 3)
end)

skinState = {
  selected = "Inferno",
  enabled = false,
  textures = {
    Galaxy = {
      ["[SilencerAR]"] = "rbxassetid://9402007158",
      ["[SMG]"] = "rbxassetid://9387614760",
      ["[TacticalShotgun]"] = "rbxassetid://9402279010",
      ["[AK47]"] = "rbxassetid://9402132929",
      ["[AUG]"] = "rbxassetid://9401832956",
      ["[AR]"] = "rbxassetid://9402007158",
      ["[Glock]"] = "rbxassetid://9401709916",
      ["[Shotgun]"] = "rbxassetid://9387933478",
      ["[Silencer]"] = "rbxassetid://9401709916",
      ["[P90]"] = "rbxassetid://9399887933",
      ["[Revolver]"] = "rbxassetid://9370936730",
      ["[RPG]"] = "rbxassetid://9399842353",
      ["[LMG]"] = "rbxassetid://9400170566",
      ["[Flamethrower]"] = "rbxassetid://9400558000",
      ["[DrumGun]"] = "rbxassetid://9381577172",
      ["[Double-Barrel SG]"] = "rbxassetid://9401441647",
    },
    Inferno = {
      ["[SilencerAR]"] = "rbxassetid://9401972413",
      ["[SMG]"] = "rbxassetid://9387593777",
      ["[TacticalShotgun]"] = "rbxassetid://9402244359",
      ["[AK47]"] = "rbxassetid://9402094255",
      ["[AUG]"] = "rbxassetid://9401802930",
      ["[AR]"] = "rbxassetid://9401972413",
      ["[Glock]"] = "rbxassetid://9401670081",
      ["[Shotgun]"] = "rbxassetid://9387831940",
      ["[Silencer]"] = "rbxassetid://9401670081",
      ["[P90]"] = "rbxassetid://9399878713",
      ["[Revolver]"] = "rbxassetid://9370404463",
      ["[RPG]"] = "rbxassetid://9399831924",
      ["[LMG]"] = "rbxassetid://9400160302",
      ["[Flamethrower]"] = "rbxassetid://9400503673",
      ["[DrumGun]"] = "rbxassetid://9381496666",
      ["[Double-Barrel SG]"] = "rbxassetid://9401416743",
    },
    Matrix = {
      ["[SilencerAR]"] = "rbxassetid://9402023983",
      ["[SMG]"] = "rbxassetid://9387681455",
      ["[TacticalShotgun]"] = "rbxassetid://9402295362",
      ["[AK47]"] = "rbxassetid://9402147406",
      ["[AUG]"] = "rbxassetid://9401855319",
      ["[AR]"] = "rbxassetid://9402023983",
      ["[Glock]"] = "rbxassetid://9401727978",
      ["[Shotgun]"] = "rbxassetid://9387945198",
      ["[Silencer]"] = "rbxassetid://9401727978",
      ["[P90]"] = "rbxassetid://9399894480",
      ["[Revolver]"] = "rbxassetid://9380928144",
      ["[RPG]"] = "rbxassetid://9399850204",
      ["[LMG]"] = "rbxassetid://9400178599",
      ["[Flamethrower]"] = "rbxassetid://9400582867",
      ["[DrumGun]"] = "rbxassetid://9381601709",
      ["[Double-Barrel SG]"] = "rbxassetid://9401457713",
    },
    RedDeath = {
      ["[SilencerAR]"] = "rbxassetid://8213168054",
      ["[SMG]"] = "rbxassetid://8199875638",
      ["[TacticalShotgun]"] = "rbxassetid://9203641766",
      ["[AK47]"] = "rbxassetid://8213572965",
      ["[AUG]"] = "rbxassetid://8212802637",
      ["[AR]"] = "rbxassetid://8213168054",
      ["[Glock]"] = "rbxassetid://8212637463",
      ["[Shotgun]"] = "rbxassetid://8200647420",
      ["[Silencer]"] = "rbxassetid://8212637463",
      ["[P90]"] = "rbxassetid://8205381104",
      ["[Revolver]"] = "rbxassetid://8173928665",
      ["[RPG]"] = "rbxassetid://8201055935",
      ["[LMG]"] = "rbxassetid://8205713344",
      ["[Flamethrower]"] = "rbxassetid://8206707126",
      ["[DrumGun]"] = "rbxassetid://8186385983",
      ["[Double-Barrel SG]"] = "rbxassetid://8212384179",
    },
    GoldGlory = {
      ["[SilencerAR]"] = "rbxassetid://8213175568",
      ["[SMG]"] = "rbxassetid://8199883519",
      ["[TacticalShotgun]"] = "rbxassetid://9203647967",
      ["[AK47]"] = "rbxassetid://8213606202",
      ["[AUG]"] = "rbxassetid://8212809463",
      ["[AR]"] = "rbxassetid://8213175568",
      ["[Glock]"] = "rbxassetid://8212667115",
      ["[Shotgun]"] = "rbxassetid://8200657428",
      ["[Silencer]"] = "rbxassetid://8212667115",
      ["[P90]"] = "rbxassetid://8205397990",
      ["[Revolver]"] = "rbxassetid://8173955378",
      ["[RPG]"] = "rbxassetid://8201059812",
      ["[LMG]"] = "rbxassetid://8205719479",
      ["[Flamethrower]"] = "rbxassetid://8208010648",
      ["[DrumGun]"] = "rbxassetid://8186168230",
      ["[Double-Barrel SG]"] = "rbxassetid://8212394280",
    },
  },
}

Character:AddDropdown("SelectSkin", {
  Text = "Select Skin",
  Values = { "Galaxy", "Inferno", "Matrix", "RedDeath", "GoldGlory" },
  Default = "Inferno",
  Callback = function(value180)
    local v281 = skinState
    v281.selected = type(value180) == "table" and value180[1] or value180
  end,
})

Character:addButton("ApplySkin", function()
  runService:UnbindFromRenderStep("Nova_SkinChanger")
  skinState.enabled = true

  runService:BindToRenderStep("Nova_SkinChanger", Enum.RenderPriority.Character.Value, function()
    if not skinState.enabled then
      return
    else
      local character77 = localPlayer12.Character
      local v282 = not character77
      local v283 = skinState.textures[skinState.selected]

      if v282 or not v283 then
        return
      end

      for key30, value181 in pairs(v283) do
        local findFirstChild14 = character77:FindFirstChild(key30)

        local default = findFirstChild14
        default = findFirstChild14 and findFirstChild14:FindFirstChild("Default")

        if default then
          if default:IsA("MeshPart") and default.TextureID ~= value181 then
            default.TextureID = value181
          elseif default:IsA("SpecialMesh") and default.TextureId ~= value181 then
            default.TextureId = value181
          end
        end
      end

      return
    end
  end)

  Notify("Applied Skin: " .. tostring(skinState.selected), 3)
end)

colorState = {
  c_on = false,
  c_color = Color3.new(1, 1, 1),
  c_orig = {},
  c_conn = nil,
  g_on = false,
  g_color = Color3.new(1, 1, 1),
  g_orig = {},
  g_conn = nil,
  g_addConn = nil,
}

function applyChar(p93)
  if not p93 then
    return
  end

  for index103, value182 in ipairs(p93:GetDescendants()) do
    if value182:IsA("BasePart") then
      if not colorState.c_orig[value182] then
        colorState.c_orig[value182] = { Material = value182.Material, Color = value182.Color }
      end

      value182.Material = Enum.Material.ForceField
      value182.Color = colorState.c_color
    end
  end
end

function applyGuns(p94)
  if not p94 then
    return
  end

  for index104, value183 in ipairs(p94:GetChildren()) do
    if value183:IsA("Tool") then
      for index105, value184 in ipairs(value183:GetDescendants()) do
        if value184:IsA("BasePart") then
          if not colorState.g_orig[value184] then
            colorState.g_orig[value184] = {
              Material = value184.Material,
              Color = value184.Color,
            }
          end

          value184.Material = Enum.Material.ForceField
          value184.Color = colorState.g_color
        end
      end
    end
  end
end

function restoreColors(p95)
  for key31, value185 in pairs(p95) do
    if key31 and key31.Parent and key31:IsA("BasePart") then
      key31.Material = value185.Material
      key31.Color = value185.Color
    end
  end

  table.clear(p95)
end

function startGunWatcher()
  if colorState.g_conn then
    colorState.g_conn:Disconnect()
    colorState.g_conn = nil
  end

  if colorState.g_addConn then
    colorState.g_addConn:Disconnect()
    colorState.g_addConn = nil
  end

  local character78 = localPlayer12.Character

  if not character78 then
    return
  end

  applyGuns(character78)

  colorState.g_addConn = character78.ChildAdded:Connect(function(child4)
    if colorState.g_on and child4:IsA("Tool") then
      task.wait()

      if colorState.g_on and localPlayer12.Character == character78 then
        applyGuns(character78)
      end
    end
  end)

  colorState.g_conn = localPlayer12.CharacterAdded:Connect(function(character79)
    task.wait(1)

    if colorState.g_on and localPlayer12.Character == character79 then
      applyGuns(character79)
    end
  end)
end

Character:AddToggle("WhiteCharacterEnabled", {
  Text = "Color Character",
  Default = false,
  ColorPicker = true,
  Color = colorState.c_color,
  Callback = function(value186)
    colorState.c_on = value186

    if colorState.c_conn then
      colorState.c_conn:Disconnect()
      colorState.c_conn = nil
    end

    if colorState.c_on then
      applyChar(localPlayer12.Character)

      colorState.c_conn = localPlayer12.CharacterAdded:Connect(function(character80)
        task.wait(1)

        if colorState.c_on then
          applyChar(character80)
        end
      end)
    else
      restoreColors(colorState.c_orig)
    end
  end,
  ColorCallback = function(cColor)
    colorState.c_color = cColor

    if colorState.c_on then
      applyChar(localPlayer12.Character)
    end
  end,
})

Character:AddToggle("WhiteGunsEnabled", {
  Text = "Color Guns",
  Default = false,
  ColorPicker = true,
  Color = colorState.g_color,
  Callback = function(value187)
    colorState.g_on = value187

    if colorState.g_conn then
      colorState.g_conn:Disconnect()
      colorState.g_conn = nil
    end

    if colorState.g_addConn then
      colorState.g_addConn:Disconnect()
      colorState.g_addConn = nil
    end

    if colorState.g_on then
      startGunWatcher()
    else
      restoreColors(colorState.g_orig)
    end
  end,
  ColorCallback = function(gColor)
    colorState.g_color = gColor

    if colorState.g_on then
      applyGuns(localPlayer12.Character)
    end
  end,
})

throwState = false

Character:AddToggle("ThrowGrenades", {
  Text = "Throw Grenades",
  Default = true,
  Keybind = Enum.KeyCode.Unknown,
  Callback = function(value188)
    if value188 then
      throwState = true
    end
  end,
})

task.spawn(function()
  while task.wait() do
    if throwState then
      throwState = false
      local backpack8 = localPlayer12:FindFirstChild("Backpack")
      local character81 = localPlayer12.Character

      if character81 and backpack8 then
        local v284 = {}

        for index106, value189 in ipairs(backpack8:GetChildren()) do
          if value189:IsA("Tool") and value189.Name == "[Grenade]" then
            value189.Parent = character81
            table.insert(v284, value189)
          end
        end

        if #v284 > 0 then
          task.wait(0.2)

          for index107, value190 in ipairs(v284) do
          end

          task.wait(0.4)

          for index108, value191 in ipairs(v284) do
          end
        end
      end
    end
  end
end)

Character:addButton("Headless (Client Sided)", function()
  local head8 = localPlayer12.Character and localPlayer12.Character:FindFirstChild("Head")

  if head8 then
    head8.Transparency = 1

    if head8:FindFirstChild("face") then
      head8.face.Transparency = 1
    end
  end
end)

HT = {
  Id = "",
  Vol = 1,
  Gen = 0,
  On = false,
  Conns = {},
  Act = {},
  Vols = {},
  Tls = {},
}

getgenv().hitsounds = {
  ["Call of Duty"] = "rbxassetid://5952120301",
  Bubble = "rbxassetid://6534947588",
  Error = "rbxassetid://160715357",
  Lazer = "rbxassetid://130791043",
  Pop = "rbxassetid://198598793",
  None = "",
  OSU = "rbxassetid://7147454322",
  Neverlose = "rbxassetid://7216848832",
  Bameware = "rbxassetid://3124331820",
  Hitmarker = "rbxassetid://160432334",
  skeet = "rbxassetid://4817809188",
  Rust = "rbxassetid://5043539486",
  ["Lazer Beam"] = "rbxassetid://130791043",
  ["Bow Hit"] = "rbxassetid://1053296915",
  Bow = "rbxassetid://3442683707",
  ["TF2 Hitsound"] = "rbxassetid://3455144981",
  ["TF2 Critical"] = "rbxassetid://296102734",
}

function HT.Mut(key32)
  if key32.Name == "NVHS" or key32:GetAttribute("NVHS") then
    return
  end

  if not HT.Vols[key32] then
    HT.Vols[key32] = key32.Volume

    key32:GetPropertyChangedSignal("Volume"):Connect(function()
      if HT.On and key32.Volume > 0 then
        HT.Vols[key32] = key32.Volume
        key32.Volume = 0
      end
    end)
  end

  key32.Volume = HT.On and 0 or HT.Vols[key32] or 0.5
end

function HT.Upd()
  for key33 in pairs(HT.Vols) do
    if key33 and key33.Parent then
      HT.Mut(key33)
    end
  end
end

function HT.Clr()
  for index109, value192 in ipairs(HT.Conns) do
    local v285 = value192
    pcall(function() v285:Disconnect() end)
  end
end

function HT.Stp()
  for key34 in pairs(HT.Act) do
    local v286 = key34

    if v286 then
      pcall(function()
        v286:Stop()
        v286:Destroy()
      end)
    end
  end

  pcall(function()
    for index110, value193 in ipairs(workspace:GetDescendants()) do
      if value193:IsA("Sound") and value193:GetAttribute("NVHS") then
        value193:Stop()
        value193:Destroy()
      end
    end
  end)
end

function HT.Ply()
  local v287 = not HT.On or HT.Id == ""
  local nvhs

  if v287 then
    return
  else
    local gen = HT.Gen
    nvhs = Instance.new("Sound")
    local id = HT.Id
    local v288 = math.clamp(HT.Vol, 0, 5)
    local v289 = workspace

    nvhs.Name = "NVHS"
    nvhs.SoundId = id
    nvhs.Volume = v288
    nvhs.PlaybackSpeed = 1
    nvhs.Looped = false
    nvhs.Parent = v289
    nvhs:SetAttribute("NVHS", true)

    HT.Act[nvhs] = true

    nvhs.Ended:Connect(function()
      HT.Act[nvhs] = nil
      pcall(function() nvhs:Destroy() end)
    end)

    if gen ~= HT.Gen then
      HT.Act[nvhs] = nil

      pcall(function()
        nvhs:Stop()
        nvhs:Destroy()
      end)

      return
    end

    pcall(function() nvhs:Play() end)
    return
  end
end

function HT.Prc(key35)
  local v290 = not key35:IsA("Tool") or HT.Tls[key35]
  local ammo4, value194

  if v290 then
    return
  else
    local getDescendants = key35.GetDescendants
    HT.Tls[key35] = true

    for index111, value195 in ipairs(getDescendants(key35)) do
      if value195:IsA("Sound") then
        HT.Mut(value195)
      end
    end

    key35.DescendantAdded:Connect(function(descendant8)
      if descendant8:IsA("Sound") then
        task.defer(function() HT.Mut(descendant8) end)
      end
    end)

    ammo4 = key35:FindFirstChild("Ammo")

    if ammo4 and (ammo4:IsA("IntValue") or ammo4:IsA("NumberValue")) then
      value194 = ammo4.Value
      local value196 = ammo4:GetPropertyChangedSignal("Value")

      table.insert(HT.Conns, value196:Connect(function()
        if HT.On and ammo4.Value < value194 then
          HT.Ply()
        end

        value194 = ammo4.Value
      end))
    end

    return
  end
end

function HT.Hk(p96)
  for index112, value197 in ipairs(p96:GetChildren()) do
    HT.Prc(value197)
  end

  local childAdded = p96.ChildAdded

  table.insert(HT.Conns, childAdded:Connect(function(p97)
    if HT.On then
      task.wait()
      HT.Prc(p97)
    end
  end))
end

task.spawn(function()
  local function f40(value198)
    if value198:IsA("Tool") then
      HT.Prc(value198)
    end
  end

  local function f41(p98)
    for index113, value199 in ipairs(p98:GetChildren()) do
      f40(value199)
    end

    p98.ChildAdded:Connect(f40)
  end

  localPlayer12.CharacterAdded:Connect(f41)

  if localPlayer12.Character then
    f41(localPlayer12.Character)
  end

  localPlayer12.ChildAdded:Connect(function(child5)
    if child5:IsA("Backpack") then
      f41(child5)
    end
  end)

  if localPlayer12:FindFirstChild("Backpack") then
    f41(localPlayer12.Backpack)
  end
end)

Character:AddToggle("HitSound", {
  Text = "Hit Sound",
  Default = false,
  Callback = function(value200)
    local ht = HT
    local gen2 = HT.Gen
    HT.On = value200
    ht.Gen = gen2 + 1

    HT.Stp()
    HT.Clr()
    HT.Upd()

    if HT.On and localPlayer12.Character then
      HT.Hk(localPlayer12.Character)
    end
  end,
})

Character:AddDropdown("SelectHitsound", {
  Text = "Select Hitsound",
  Values = {
    "Call of Duty", "Bubble", "Error", "Lazer", "Pop", "None", "OSU", "Neverlose", "Bameware",
    "Hitmarker", "skeet", "Rust", "Lazer Beam", "Bow Hit", "Bow", "TF2 Hitsound",
    "TF2 Critical",
  },
  Default = "None",
  Callback = function(value201)
    local ht2 = HT
    ht2.Id = getgenv().hitsounds[type(value201) == "table" and value201[1] or value201] or ""

    HT.Gen = HT.Gen + 1
    HT.Stp()
  end,
})

Character:AddSlider("HitsoundVolume", {
  Text = "Hitsound Volume",
  Min = 1,
  Max = 5,
  Default = 1,
  Rounding = 0,
  Callback = function(value202)
    HT.Vol = tonumber(value202) or 1

    for key36 in pairs(HT.Act) do
      local v291 = key36

      if v291 and v291.Parent then
        pcall(function() v291.Volume = math.clamp(HT.Vol, 0, 5) end)
      end
    end
  end,
})