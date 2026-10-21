local function newSignal()
  local signal = { connections = {} }
  function signal:Connect(callback)
    local connection = {
      connected = true,
      Disconnect = function(self)
        self.connected = false
      end,
    }
    table.insert(self.connections, callback)
    return connection
  end
  return signal
end

local UI_CLASSES = {
  Frame = true,
  ScrollingFrame = true,
  TextLabel = true,
  TextButton = true,
  TextBox = true,
  ImageLabel = true,
  ImageButton = true,
}

local function newInstance(className)
  local object = {
    _class = className,
    _props = {},
    _children = {},
  }
  object.MouseButton1Click = newSignal()
  object.InputBegan = newSignal()
  object.InputChanged = newSignal()
  object.InputEnded = newSignal()
  object.TextChanged = newSignal()

  local methods = {}

  function methods:IsA(name)
    if name == self._class then
      return true
    end
    if name == "GuiObject" then
      return UI_CLASSES[self._class] == true
    end
    if name == "Instance" then
      return true
    end
    return false
  end

  function methods:GetChildren()
    local copy = {}
    for index, child in ipairs(self._children) do
      copy[index] = child
    end
    return copy
  end

  function methods:GetDescendants()
    local result = {}
    local function visit(parent)
      for _, child in ipairs(parent._children) do
        table.insert(result, child)
        visit(child)
      end
    end
    visit(self)
    return result
  end

  function methods:FindFirstChild(name)
    for _, child in ipairs(self._children) do
      if child.Name == name then
        return child
      end
    end
    return nil
  end

  function methods:FindFirstChildOfClass(class)
    for _, child in ipairs(self._children) do
      if child.ClassName == class then
        return child
      end
    end
    return nil
  end

  function methods:GetPropertyChangedSignal()
    return self.TextChanged
  end

  function methods:CaptureFocus()
    return nil
  end

  function methods:ReleaseFocus()
    return nil
  end

  function methods:Destroy()
    if self.Parent ~= nil then
      local siblings = self.Parent._children
      for index = #siblings, 1, -1 do
        if siblings[index] == self then
          table.remove(siblings, index)
        end
      end
    end
    self._props.Parent = nil
  end

  setmetatable(object, {
    __index = function(self, key)
      if methods[key] ~= nil then
        return methods[key]
      end
      if key == "ClassName" then
        return self._class
      end
      if key == "Text" then
        return self._props.Text or ""
      end
      if key == "Name" then
        return self._props.Name or self._class
      end
      if key == "Visible" then
        local value = self._props.Visible
        if value == nil then
          return true
        end
        return value
      end
      if key == "BackgroundTransparency" then
        return self._props.BackgroundTransparency or 0
      end
      return self._props[key]
    end,
    __newindex = function(self, key, value)
      if key == "Parent" then
        local old = self._props.Parent
        if old ~= nil then
          for index = #old._children, 1, -1 do
            if old._children[index] == self then
              table.remove(old._children, index)
            end
          end
        end
        self._props.Parent = value
        if value ~= nil then
          table.insert(value._children, self)
        end
        return
      end
      self._props[key] = value
    end,
  })

  return object
end

Instance = {
  new = function(className)
    return newInstance(className)
  end,
}

UDim2 = {
  new = function(xScale, xOffset, yScale, yOffset)
    return {
      X = { Scale = xScale, Offset = xOffset },
      Y = { Scale = yScale, Offset = yOffset },
    }
  end,
}

UDim = {
  new = function(scale, offset)
    return { Scale = scale, Offset = offset }
  end,
}

Color3 = {
  fromRGB = function(red, green, blue)
    return { R = red / 255, G = green / 255, B = blue / 255 }
  end,
  fromHSV = function(hue, saturation, value)
    return { R = hue, G = saturation, B = value }
  end,
}

ColorSequence = {
  new = function(first, second)
    return { first = first, second = second }
  end,
}

NumberSequence = {
  new = function(first, second)
    return { first = first, second = second }
  end,
}

Vector2 = {
  new = function(x, y)
    return { X = x, Y = y }
  end,
}

TweenInfo = {
  new = function(duration, style, direction)
    return { Time = duration, Style = style, Direction = direction }
  end,
}

local function newEnum()
  return setmetatable({}, {
    __index = function(self, key)
      local value = { Name = key }
      rawset(self, key, value)
      return value
    end,
  })
end

Enum = setmetatable({}, {
  __index = function(self, key)
    local value = newEnum()
    rawset(self, key, value)
    return value
  end,
})

local function newService(name)
  local service = newInstance("Service")
  service._props.Name = name
  return service
end

local tweenService = newService("TweenService")
local tweenMethods = {}
function tweenMethods:Create()
  return {
    Play = function()
      return nil
    end,
    Cancel = function()
      return nil
    end,
  }
end
setmetatable(tweenService, {
  __index = function(self, key)
    if tweenMethods[key] ~= nil then
      return tweenMethods[key]
    end
    return newInstance.__index
  end,
})

local players = newService("Players")
players.LocalPlayer = {
  Name = "MockPlayer",
  UserId = 1,
  GetChildren = function()
    return {}
  end,
}
players.LocalPlayer.Parent = players

local userInputService = newService("UserInputService")
userInputService.InputBegan = newSignal()
userInputService.InputChanged = newSignal()
userInputService.InputEnded = newSignal()
userInputService.GetMouseLocation = function()
  return Vector2.new(0, 0)
end

local runService = newService("RunService")
runService.RenderStepped = newSignal()
runService.Heartbeat = newSignal()

local services = {
  Players = players,
  TweenService = tweenService,
  UserInputService = userInputService,
  RunService = runService,
}

game = {
  GetService = function(_, name)
    if services[name] ~= nil then
      return services[name]
    end
    local service = newService(name)
    services[name] = service
    return service
  end,
}

workspace = newInstance("Workspace")
workspace._props.Name = "Workspace"
workspace._props.Parent = game

Players = players
UserInputService = userInputService

task = {
  wait = function()
    return nil
  end,
  spawn = function(callback)
    return callback()
  end,
  delay = function(_, callback)
    return callback
  end,
}

wait = function()
  return nil
end

tick = function()
  return os.clock()
end
