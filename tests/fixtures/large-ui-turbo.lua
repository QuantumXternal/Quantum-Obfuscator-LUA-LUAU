--@quantum:turbo
local function createRoot(parent, width, height)
  local root = Instance.new("Frame")
  root.Name = "QuantumRoot"
  root.Size = UDim2.new(1, 0, 1, 0)
  root.BackgroundColor3 = Color3.fromRGB(17, 18, 24)
  root.BorderSizePixel = 0
  root.ClipsDescendants = false
  local shadow = Instance.new("Frame")
  shadow.Name = "Shadow"
  shadow.Size = UDim2.new(1, 18, 1, 18)
  shadow.Position = UDim2.new(0, -9, 0, -9)
  shadow.BackgroundColor3 = Color3.fromRGB(4, 4, 8)
  shadow.BackgroundTransparency = 0.55
  shadow.BorderSizePixel = 0
  shadow.ZIndex = 0
  shadow.Parent = root
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(0, 10)
  corner.Parent = root
  local stroke = Instance.new("UIStroke")
  stroke.Color = Color3.fromRGB(54, 56, 72)
  stroke.Thickness = 1
  stroke.Transparency = 0.2
  stroke.Parent = root
  local aspect = Instance.new("UIAspectRatioConstraint")
  aspect.AspectRatio = width / height
  aspect.DominantAxis = Enum.DominantAxis.Width
  aspect.Parent = root
  for index = 1, 2 do
    local guide = Instance.new("Frame")
    guide.Name = "Guide" .. index
    guide.Size = UDim2.new(1, 0, 0, 1)
    guide.Position = UDim2.new(0, 0, index / 3, 0)
    guide.BackgroundColor3 = Color3.fromRGB(30, 32, 42)
    guide.BackgroundTransparency = 0.65
    guide.BorderSizePixel = 0
    guide.Parent = root
  end
  if parent ~= nil then
    root.Parent = parent
  else
    root.Parent = workspace
  end
  return root
end

--@quantum:turbo
local function createHeader(root, title, subtitle)
  local header = Instance.new("Frame")
  header.Name = "Header"
  header.Size = UDim2.new(1, -28, 0, 64)
  header.Position = UDim2.new(0, 14, 0, 14)
  header.BackgroundColor3 = Color3.fromRGB(24, 26, 34)
  header.BackgroundTransparency = 0.35
  header.BorderSizePixel = 0
  header.Parent = root
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(0, 8)
  corner.Parent = header
  local titleLabel = Instance.new("TextLabel")
  titleLabel.Name = "Title"
  titleLabel.Size = UDim2.new(1, -24, 0, 28)
  titleLabel.Position = UDim2.new(0, 12, 0, 8)
  titleLabel.BackgroundTransparency = 1
  titleLabel.Text = title
  titleLabel.TextColor3 = Color3.fromRGB(242, 244, 250)
  titleLabel.TextSize = 20
  titleLabel.TextXAlignment = Enum.TextXAlignment.Left
  titleLabel.Font = Enum.Font.GothamBold
  titleLabel.Parent = header
  local subtitleLabel = Instance.new("TextLabel")
  subtitleLabel.Name = "Subtitle"
  subtitleLabel.Size = UDim2.new(1, -24, 0, 18)
  subtitleLabel.Position = UDim2.new(0, 12, 0, 36)
  subtitleLabel.BackgroundTransparency = 1
  subtitleLabel.Text = subtitle or "Settings loaded"
  subtitleLabel.TextColor3 = Color3.fromRGB(146, 150, 166)
  subtitleLabel.TextSize = 13
  subtitleLabel.TextXAlignment = Enum.TextXAlignment.Left
  subtitleLabel.Font = Enum.Font.Gotham
  subtitleLabel.Parent = header
  local divider = Instance.new("Frame")
  divider.Name = "HeaderDivider"
  divider.Size = UDim2.new(1, -24, 0, 1)
  divider.Position = UDim2.new(0, 12, 1, -8)
  divider.BackgroundColor3 = Color3.fromRGB(64, 68, 86)
  divider.BorderSizePixel = 0
  divider.Parent = header
  if #title > 24 then
    titleLabel.TextScaled = true
  else
    titleLabel.TextScaled = false
  end
  return header, titleLabel, subtitleLabel
end

--@quantum:turbo
local function createSearchBox(root, placeholder)
  local box = Instance.new("Frame")
  box.Name = "SearchBox"
  box.Size = UDim2.new(1, -28, 0, 34)
  box.Position = UDim2.new(0, 14, 0, 88)
  box.BackgroundColor3 = Color3.fromRGB(28, 30, 40)
  box.BorderSizePixel = 0
  box.Parent = root
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(0, 6)
  corner.Parent = box
  local icon = Instance.new("TextLabel")
  icon.Name = "Icon"
  icon.Size = UDim2.new(0, 30, 1, 0)
  icon.BackgroundTransparency = 1
  icon.Text = "?"
  icon.TextColor3 = Color3.fromRGB(118, 122, 142)
  icon.TextSize = 16
  icon.Font = Enum.Font.GothamBold
  icon.Parent = box
  local input = Instance.new("TextBox")
  input.Name = "Input"
  input.Size = UDim2.new(1, -64, 1, 0)
  input.Position = UDim2.new(0, 30, 0, 0)
  input.BackgroundTransparency = 1
  input.Text = ""
  input.PlaceholderText = placeholder
  input.PlaceholderColor3 = Color3.fromRGB(96, 100, 118)
  input.TextColor3 = Color3.fromRGB(232, 234, 244)
  input.TextSize = 14
  input.TextXAlignment = Enum.TextXAlignment.Left
  input.ClearTextOnFocus = false
  input.Font = Enum.Font.Gotham
  input.Parent = box
  local clear = Instance.new("TextButton")
  clear.Name = "Clear"
  clear.Size = UDim2.new(0, 28, 0, 28)
  clear.Position = UDim2.new(1, -34, 0, 3)
  clear.BackgroundColor3 = Color3.fromRGB(38, 40, 52)
  clear.Text = "x"
  clear.TextColor3 = Color3.fromRGB(160, 164, 182)
  clear.TextSize = 13
  clear.Font = Enum.Font.GothamBold
  clear.Parent = box
  input:GetPropertyChangedSignal("Text"):Connect(function()
    if #input.Text > 0 then
      clear.Visible = true
    else
      clear.Visible = false
    end
  end)
  clear.MouseButton1Click:Connect(function()
    input.Text = ""
    input:CaptureFocus()
  end)
  return box, input
end

--@quantum:turbo
local function createTabBar(root, labels)
  local bar = Instance.new("Frame")
  bar.Name = "TabBar"
  bar.Size = UDim2.new(1, -28, 0, 36)
  bar.Position = UDim2.new(0, 14, 0, 132)
  bar.BackgroundColor3 = Color3.fromRGB(22, 24, 31)
  bar.BorderSizePixel = 0
  bar.Parent = root
  local layout = Instance.new("UIListLayout")
  layout.FillDirection = Enum.FillDirection.Horizontal
  layout.Padding = UDim.new(0, 4)
  layout.SortOrder = Enum.SortOrder.LayoutOrder
  layout.Parent = bar
  local buttons = {}
  local active = 1
  local function selectTab(index)
    if index < 1 or index > #buttons then
      return
    end
    if active == index then
      return
    end
    for position, button in ipairs(buttons) do
      if position == index then
        button.BackgroundColor3 = Color3.fromRGB(54, 92, 210)
        button.TextColor3 = Color3.fromRGB(255, 255, 255)
      else
        button.BackgroundColor3 = Color3.fromRGB(30, 32, 42)
        button.TextColor3 = Color3.fromRGB(156, 160, 178)
      end
    end
    active = index
  end
  for index, label in ipairs(labels) do
    local button = Instance.new("TextButton")
    button.Name = "Tab" .. index
    button.Size = UDim2.new(0, 86, 1, 0)
    button.BackgroundColor3 = Color3.fromRGB(30, 32, 42)
    button.BorderSizePixel = 0
    button.Text = label
    button.TextSize = 14
    button.Font = Enum.Font.GothamMedium
    button.TextColor3 = Color3.fromRGB(156, 160, 178)
    button.LayoutOrder = index
    button.Parent = bar
    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 5)
    corner.Parent = button
    button.MouseButton1Click:Connect(function()
      selectTab(index)
    end)
    table.insert(buttons, button)
  end
  selectTab(1)
  return {
    frame = bar,
    buttons = buttons,
    select = function(index)
      selectTab(index)
    end,
    getActive = function()
      return active
    end,
  }
end

--@quantum:turbo
local function createSection(root, title, order)
  local section = Instance.new("Frame")
  section.Name = "Section" .. order
  section.Size = UDim2.new(1, -28, 0, 46)
  section.Position = UDim2.new(0, 14, 0, 176 + (order - 1) * 52)
  section.BackgroundColor3 = Color3.fromRGB(24, 26, 34)
  section.BackgroundTransparency = 0.2
  section.BorderSizePixel = 0
  section.LayoutOrder = order
  section.Parent = root
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(0, 7)
  corner.Parent = section
  local label = Instance.new("TextLabel")
  label.Name = "Label"
  label.Size = UDim2.new(1, -20, 1, 0)
  label.Position = UDim2.new(0, 12, 0, 0)
  label.BackgroundTransparency = 1
  label.Text = title
  label.TextColor3 = Color3.fromRGB(220, 224, 238)
  label.TextSize = 15
  label.TextXAlignment = Enum.TextXAlignment.Left
  label.Font = Enum.Font.GothamMedium
  label.Parent = section
  local content = Instance.new("Frame")
  content.Name = "Content"
  content.Size = UDim2.new(1, -24, 0, 64)
  content.Position = UDim2.new(0, 12, 1, 6)
  content.BackgroundTransparency = 1
  content.Parent = section
  local contentLayout = Instance.new("UIListLayout")
  contentLayout.Padding = UDim.new(0, 6)
  contentLayout.SortOrder = Enum.SortOrder.LayoutOrder
  contentLayout.Parent = content
  if order > 6 then
    section.BackgroundTransparency = 0.35
  end
  return section, content
end

--@quantum:turbo
local function createToggle(parent, label, default)
  local container = Instance.new("Frame")
  container.Name = "Toggle"
  container.Size = UDim2.new(1, 0, 0, 34)
  container.BackgroundTransparency = 1
  container.Parent = parent
  local text = Instance.new("TextLabel")
  text.Name = "Label"
  text.Size = UDim2.new(1, -64, 1, 0)
  text.BackgroundTransparency = 1
  text.Text = label
  text.TextColor3 = Color3.fromRGB(206, 210, 226)
  text.TextSize = 14
  text.TextXAlignment = Enum.TextXAlignment.Left
  text.Font = Enum.Font.Gotham
  text.Parent = container
  local button = Instance.new("TextButton")
  button.Name = "Switch"
  button.Size = UDim2.new(0, 44, 0, 24)
  button.Position = UDim2.new(1, -44, 0, 5)
  button.BackgroundColor3 = Color3.fromRGB(44, 46, 60)
  button.BorderSizePixel = 0
  button.Text = ""
  button.Parent = container
  local buttonCorner = Instance.new("UICorner")
  buttonCorner.CornerRadius = UDim.new(0, 12)
  buttonCorner.Parent = button
  local knob = Instance.new("Frame")
  knob.Name = "Knob"
  knob.Size = UDim2.new(0, 18, 0, 18)
  knob.Position = UDim2.new(0, 3, 0, 3)
  knob.BackgroundColor3 = Color3.fromRGB(196, 200, 218)
  knob.BorderSizePixel = 0
  knob.Parent = button
  local knobCorner = Instance.new("UICorner")
  knobCorner.CornerRadius = UDim.new(1, 0)
  knobCorner.Parent = knob
  local enabled = default == true
  local function setValue(value)
    enabled = value == true
    if enabled then
      button.BackgroundColor3 = Color3.fromRGB(54, 122, 226)
      knob.Position = UDim2.new(1, -21, 0, 3)
    else
      button.BackgroundColor3 = Color3.fromRGB(44, 46, 60)
      knob.Position = UDim2.new(0, 3, 0, 3)
    end
    return enabled
  end
  button.MouseButton1Click:Connect(function()
    setValue(not enabled)
  end)
  setValue(enabled)
  return {
    frame = container,
    set = setValue,
    get = function()
      return enabled
    end,
  }
end

--@quantum:turbo
local function createSlider(parent, label, minValue, maxValue, initial)
  local container = Instance.new("Frame")
  container.Name = "Slider"
  container.Size = UDim2.new(1, 0, 0, 46)
  container.BackgroundTransparency = 1
  container.Parent = parent
  local text = Instance.new("TextLabel")
  text.Name = "Label"
  text.Size = UDim2.new(1, -70, 0, 18)
  text.BackgroundTransparency = 1
  text.Text = label
  text.TextColor3 = Color3.fromRGB(206, 210, 226)
  text.TextSize = 14
  text.TextXAlignment = Enum.TextXAlignment.Left
  text.Font = Enum.Font.Gotham
  text.Parent = container
  local valueLabel = Instance.new("TextLabel")
  valueLabel.Name = "Value"
  valueLabel.Size = UDim2.new(0, 62, 0, 18)
  valueLabel.Position = UDim2.new(1, -62, 0, 0)
  valueLabel.BackgroundTransparency = 1
  valueLabel.Text = tostring(initial)
  valueLabel.TextColor3 = Color3.fromRGB(122, 162, 250)
  valueLabel.TextSize = 13
  valueLabel.TextXAlignment = Enum.TextXAlignment.Right
  valueLabel.Font = Enum.Font.GothamBold
  valueLabel.Parent = container
  local track = Instance.new("Frame")
  track.Name = "Track"
  track.Size = UDim2.new(1, 0, 0, 4)
  track.Position = UDim2.new(0, 0, 0, 32)
  track.BackgroundColor3 = Color3.fromRGB(46, 48, 62)
  track.BorderSizePixel = 0
  track.Parent = container
  local trackCorner = Instance.new("UICorner")
  trackCorner.CornerRadius = UDim.new(1, 0)
  trackCorner.Parent = track
  local fill = Instance.new("Frame")
  fill.Name = "Fill"
  fill.Size = UDim2.new(0.5, 0, 1, 0)
  fill.BackgroundColor3 = Color3.fromRGB(70, 112, 224)
  fill.BorderSizePixel = 0
  fill.Parent = track
  local fillCorner = Instance.new("UICorner")
  fillCorner.CornerRadius = UDim.new(1, 0)
  fillCorner.Parent = fill
  local current = initial
  if current < minValue then
    current = minValue
  elseif current > maxValue then
    current = maxValue
  end
  local function setValue(value)
    if value < minValue then
      value = minValue
    elseif value > maxValue then
      value = maxValue
    end
    current = value
    local span = maxValue - minValue
    local ratio = 0
    if span > 0 then
      ratio = (value - minValue) / span
    end
    fill.Size = UDim2.new(ratio, 0, 1, 0)
    valueLabel.Text = string.format("%.2f", value)
    return value
  end
  track.MouseButton1Click:Connect(function()
    local nextValue = current + 0.1
    if nextValue > maxValue then
      nextValue = minValue
    end
    setValue(nextValue)
  end)
  setValue(current)
  return {
    frame = container,
    set = setValue,
    get = function()
      return current
    end,
  }
end

--@quantum:turbo
local function createDropdown(parent, label, options)
  local container = Instance.new("Frame")
  container.Name = "Dropdown"
  container.Size = UDim2.new(1, 0, 0, 34)
  container.BackgroundTransparency = 1
  container.ClipsDescendants = false
  container.Parent = parent
  local text = Instance.new("TextLabel")
  text.Name = "Label"
  text.Size = UDim2.new(1, -150, 1, 0)
  text.BackgroundTransparency = 1
  text.Text = label
  text.TextColor3 = Color3.fromRGB(206, 210, 226)
  text.TextSize = 14
  text.TextXAlignment = Enum.TextXAlignment.Left
  text.Font = Enum.Font.Gotham
  text.Parent = container
  local button = Instance.new("TextButton")
  button.Name = "Selector"
  button.Size = UDim2.new(0, 138, 0, 28)
  button.Position = UDim2.new(1, -138, 0, 3)
  button.BackgroundColor3 = Color3.fromRGB(32, 34, 45)
  button.BorderSizePixel = 0
  button.Text = options[1] or "Select"
  button.TextColor3 = Color3.fromRGB(196, 200, 218)
  button.TextSize = 13
  button.Font = Enum.Font.Gotham
  button.Parent = container
  local buttonCorner = Instance.new("UICorner")
  buttonCorner.CornerRadius = UDim.new(0, 5)
  buttonCorner.Parent = button
  local list = Instance.new("Frame")
  list.Name = "List"
  list.Size = UDim2.new(0, 138, 0, 0)
  list.Position = UDim2.new(1, -138, 1, 2)
  list.BackgroundColor3 = Color3.fromRGB(24, 26, 35)
  list.BorderSizePixel = 0
  list.Visible = false
  list.Parent = container
  local listCorner = Instance.new("UICorner")
  listCorner.CornerRadius = UDim.new(0, 5)
  listCorner.Parent = list
  local listLayout = Instance.new("UIListLayout")
  listLayout.Padding = UDim.new(0, 2)
  listLayout.Parent = list
  local selected = 1
  local function select(index)
    if index < 1 or index > #options then
      return
    end
    selected = index
    button.Text = options[index]
    list.Visible = false
    return index
  end
  button.MouseButton1Click:Connect(function()
    list.Visible = not list.Visible
    list.Size = UDim2.new(0, 138, 0, math.min(#options, 5) * 26 + 4)
  end)
  for index, option in ipairs(options) do
    local item = Instance.new("TextButton")
    item.Name = "Option" .. index
    item.Size = UDim2.new(1, -4, 0, 24)
    item.Position = UDim2.new(0, 2, 0, 2 + (index - 1) * 26)
    item.BackgroundColor3 = Color3.fromRGB(32, 34, 45)
    item.BackgroundTransparency = 0.4
    item.BorderSizePixel = 0
    item.Text = option
    item.TextColor3 = Color3.fromRGB(196, 200, 218)
    item.TextSize = 12
    item.Font = Enum.Font.Gotham
    item.Parent = list
    item.MouseButton1Click:Connect(function()
      select(index)
    end)
  end
  return {
    frame = container,
    select = select,
    get = function()
      return selected
    end,
  }
end

--@quantum:turbo
local function createKeybind(parent, label, keyName)
  local container = Instance.new("Frame")
  container.Name = "Keybind"
  container.Size = UDim2.new(1, 0, 0, 34)
  container.BackgroundTransparency = 1
  container.Parent = parent
  local text = Instance.new("TextLabel")
  text.Name = "Label"
  text.Size = UDim2.new(1, -100, 1, 0)
  text.BackgroundTransparency = 1
  text.Text = label
  text.TextColor3 = Color3.fromRGB(206, 210, 226)
  text.TextSize = 14
  text.TextXAlignment = Enum.TextXAlignment.Left
  text.Font = Enum.Font.Gotham
  text.Parent = container
  local button = Instance.new("TextButton")
  button.Name = "Key"
  button.Size = UDim2.new(0, 88, 0, 26)
  button.Position = UDim2.new(1, -88, 0, 4)
  button.BackgroundColor3 = Color3.fromRGB(32, 34, 45)
  button.BorderSizePixel = 0
  button.Text = keyName
  button.TextColor3 = Color3.fromRGB(184, 188, 206)
  button.TextSize = 12
  button.Font = Enum.Font.GothamBold
  button.Parent = container
  local current = keyName
  local listening = false
  local function setKey(value)
    current = value
    button.Text = value
    listening = false
    return current
  end
  button.MouseButton1Click:Connect(function()
    listening = true
    button.Text = "..."
  end)
  local connection = UserInputService.InputBegan:Connect(function(input)
    if not listening then
      return
    end
    if input.UserInputType ~= Enum.UserInputType.Keyboard then
      return
    end
    local key = tostring(input.KeyCode)
    if #key > 0 then
      setKey(string.upper(key))
    end
  end)
  return {
    frame = container,
    set = setKey,
    get = function()
      return current
    end,
    connection = connection,
  }
end

--@quantum:turbo
local function createActionButton(parent, label, tone)
  local button = Instance.new("TextButton")
  button.Name = "ActionButton"
  button.Size = UDim2.new(1, 0, 0, 32)
  button.BackgroundColor3 = Color3.fromRGB(54, 92, 210)
  button.BorderSizePixel = 0
  button.Text = label
  button.TextColor3 = Color3.fromRGB(255, 255, 255)
  button.TextSize = 14
  button.Font = Enum.Font.GothamBold
  button.Parent = parent
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(0, 6)
  corner.Parent = button
  local stroke = Instance.new("UIStroke")
  stroke.Color = Color3.fromRGB(92, 130, 240)
  stroke.Thickness = 1
  stroke.Transparency = 0.25
  stroke.Parent = button
  if tone == "danger" then
    button.BackgroundColor3 = Color3.fromRGB(190, 58, 72)
    stroke.Color = Color3.fromRGB(230, 96, 110)
  elseif tone == "success" then
    button.BackgroundColor3 = Color3.fromRGB(38, 142, 94)
    stroke.Color = Color3.fromRGB(74, 190, 136)
  end
  button.MouseButton1Click:Connect(function()
    if tone == "danger" then
      button.Text = label .. " !"
    else
      button.Text = label .. " ..."
    end
  end)
  return button
end

--@quantum:turbo
local function createBadge(parent, text, color)
  local badge = Instance.new("Frame")
  badge.Name = "Badge"
  badge.Size = UDim2.new(0, 58, 0, 20)
  badge.BackgroundColor3 = color or Color3.fromRGB(54, 92, 210)
  badge.BorderSizePixel = 0
  badge.Parent = parent
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(1, 0)
  corner.Parent = badge
  local gradient = Instance.new("UIGradient")
  gradient.Color = ColorSequence.new(Color3.fromRGB(84, 122, 240), Color3.fromRGB(40, 70, 180))
  gradient.Rotation = 35
  gradient.Parent = badge
  local label = Instance.new("TextLabel")
  label.Name = "Text"
  label.Size = UDim2.new(1, -10, 1, 0)
  label.Position = UDim2.new(0, 5, 0, 0)
  label.BackgroundTransparency = 1
  label.Text = text
  label.TextColor3 = Color3.fromRGB(245, 247, 255)
  label.TextSize = 11
  label.TextXAlignment = Enum.TextXAlignment.Center
  label.Font = Enum.Font.GothamBold
  label.Parent = badge
  if #text > 6 then
    label.TextScaled = true
  end
  return badge
end

--@quantum:turbo
local function createDivider(parent, order)
  local divider = Instance.new("Frame")
  divider.Name = "Divider" .. order
  divider.Size = UDim2.new(1, 0, 0, 1)
  divider.BackgroundColor3 = Color3.fromRGB(48, 50, 64)
  divider.BackgroundTransparency = 0.25
  divider.BorderSizePixel = 0
  divider.LayoutOrder = order
  divider.Parent = parent
  local accent = Instance.new("Frame")
  accent.Name = "Accent"
  accent.Size = UDim2.new(0.18, 0, 1, 0)
  accent.BackgroundColor3 = Color3.fromRGB(92, 130, 240)
  accent.BorderSizePixel = 0
  accent.Parent = divider
  local glow = Instance.new("UIGradient")
  glow.Transparency = NumberSequence.new(0, 1)
  glow.Parent = accent
  return divider
end

--@quantum:turbo
local function createScrollingList(parent, rows)
  local scroll = Instance.new("ScrollingFrame")
  scroll.Name = "List"
  scroll.Size = UDim2.new(1, 0, 0, 220)
  scroll.BackgroundColor3 = Color3.fromRGB(20, 22, 30)
  scroll.BorderSizePixel = 0
  scroll.ScrollBarThickness = 4
  scroll.CanvasSize = UDim2.new(0, 0, 0, rows * 34)
  scroll.Parent = parent
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(0, 7)
  corner.Parent = scroll
  local layout = Instance.new("UIListLayout")
  layout.Padding = UDim.new(0, 4)
  layout.SortOrder = Enum.SortOrder.LayoutOrder
  layout.Parent = scroll
  for index = 1, rows do
    local row = Instance.new("Frame")
    row.Name = "Row" .. index
    row.Size = UDim2.new(1, -10, 0, 30)
    row.Position = UDim2.new(0, 5, 0, (index - 1) * 34 + 5)
    row.BackgroundColor3 = Color3.fromRGB(28, 30, 40)
    row.BorderSizePixel = 0
    row.LayoutOrder = index
    row.Parent = scroll
    local rowCorner = Instance.new("UICorner")
    rowCorner.CornerRadius = UDim.new(0, 5)
    rowCorner.Parent = row
    local label = Instance.new("TextLabel")
    label.Name = "Label"
    label.Size = UDim2.new(1, -80, 1, 0)
    label.Position = UDim2.new(0, 10, 0, 0)
    label.BackgroundTransparency = 1
    label.Text = string.format("Layer %02d", index)
    label.TextColor3 = Color3.fromRGB(198, 202, 218)
    label.TextSize = 12
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Font = Enum.Font.Gotham
    label.Parent = row
    if index % 2 == 0 then
      row.BackgroundColor3 = Color3.fromRGB(32, 34, 46)
    end
    local badge = createBadge(row, "L" .. index, Color3.fromRGB(54, 92, 210))
    badge.Position = UDim2.new(1, -62, 0, 5)
  end
  return scroll
end

--@quantum:turbo
local function createNotification(parent, title, message)
  local toast = Instance.new("Frame")
  toast.Name = "Toast"
  toast.Size = UDim2.new(0, 260, 0, 58)
  toast.Position = UDim2.new(1, -280, 0, 14)
  toast.BackgroundColor3 = Color3.fromRGB(28, 30, 40)
  toast.BorderSizePixel = 0
  toast.Parent = parent
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(0, 7)
  corner.Parent = toast
  local stroke = Instance.new("UIStroke")
  stroke.Color = Color3.fromRGB(64, 112, 220)
  stroke.Thickness = 1
  stroke.Parent = toast
  local titleLabel = Instance.new("TextLabel")
  titleLabel.Name = "Title"
  titleLabel.Size = UDim2.new(1, -20, 0, 22)
  titleLabel.Position = UDim2.new(0, 10, 0, 7)
  titleLabel.BackgroundTransparency = 1
  titleLabel.Text = title
  titleLabel.TextColor3 = Color3.fromRGB(238, 240, 250)
  titleLabel.TextSize = 13
  titleLabel.TextXAlignment = Enum.TextXAlignment.Left
  titleLabel.Font = Enum.Font.GothamBold
  titleLabel.Parent = toast
  local messageLabel = Instance.new("TextLabel")
  messageLabel.Name = "Message"
  messageLabel.Size = UDim2.new(1, -20, 0, 18)
  messageLabel.Position = UDim2.new(0, 10, 0, 29)
  messageLabel.BackgroundTransparency = 1
  messageLabel.Text = message
  messageLabel.TextColor3 = Color3.fromRGB(154, 158, 176)
  messageLabel.TextSize = 12
  messageLabel.TextXAlignment = Enum.TextXAlignment.Left
  messageLabel.Font = Enum.Font.Gotham
  messageLabel.Parent = toast
  if #message > 64 then
    toast.Size = UDim2.new(0, 300, 0, 74)
  end
  task.delay(2, function()
    if toast.Parent ~= nil then
      toast.Visible = false
    end
  end)
  return toast
end

--@quantum:turbo
local function createTooltip(parent, text)
  local tooltip = Instance.new("Frame")
  tooltip.Name = "Tooltip"
  tooltip.Size = UDim2.new(0, 190, 0, 34)
  tooltip.BackgroundColor3 = Color3.fromRGB(12, 13, 18)
  tooltip.BackgroundTransparency = 0.08
  tooltip.BorderSizePixel = 0
  tooltip.Parent = parent
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(0, 5)
  corner.Parent = tooltip
  local stroke = Instance.new("UIStroke")
  stroke.Color = Color3.fromRGB(70, 74, 92)
  stroke.Thickness = 1
  stroke.Transparency = 0.15
  stroke.Parent = tooltip
  local label = Instance.new("TextLabel")
  label.Name = "Label"
  label.Size = UDim2.new(1, -14, 1, 0)
  label.Position = UDim2.new(0, 7, 0, 0)
  label.BackgroundTransparency = 1
  if #text > 38 then
    label.Text = string.sub(text, 1, 35) .. "..."
  else
    label.Text = text
  end
  label.TextColor3 = Color3.fromRGB(208, 212, 228)
  label.TextSize = 11
  label.TextXAlignment = Enum.TextXAlignment.Left
  label.Font = Enum.Font.Gotham
  label.Parent = tooltip
  return tooltip
end

--@quantum:turbo
local function applyTheme(root, dark)
  local background = Color3.fromRGB(17, 18, 24)
  local surface = Color3.fromRGB(24, 26, 34)
  local textMain = Color3.fromRGB(238, 240, 250)
  local textSub = Color3.fromRGB(154, 158, 176)
  if not dark then
    background = Color3.fromRGB(238, 240, 246)
    surface = Color3.fromRGB(250, 251, 255)
    textMain = Color3.fromRGB(28, 30, 40)
    textSub = Color3.fromRGB(92, 96, 114)
  end
  root.BackgroundColor3 = background
  local descendants = root:GetDescendants()
  for _, item in ipairs(descendants) do
    if item:IsA("TextLabel") or item:IsA("TextButton") or item:IsA("TextBox") then
      if item.Name == "Subtitle" or item.Name == "Message" then
        item.TextColor3 = textSub
      elseif item.Name ~= "Accent" then
        item.TextColor3 = textMain
      end
    elseif item:IsA("Frame") and item.Name ~= "Accent" and item.Name ~= "Shadow" then
      if item.Name == "Header" or item.Name == "SearchBox" or item.Name == "Section1" then
        item.BackgroundColor3 = surface
      end
    end
  end
  return root
end

--@quantum:turbo
local function layoutChildren(parent, gap)
  local layout = parent:FindFirstChildOfClass("UIListLayout")
  if layout == nil then
    layout = Instance.new("UIListLayout")
    layout.Parent = parent
  end
  layout.Padding = UDim.new(0, gap)
  layout.SortOrder = Enum.SortOrder.LayoutOrder
  local children = parent:GetChildren()
  local visible = 0
  for index, child in ipairs(children) do
    if child:IsA("GuiObject") then
      child.LayoutOrder = index
      if child.Visible then
        visible = visible + 1
      end
    end
  end
  return visible
end

--@quantum:turbo
local function animateOpen(frame)
  local tweenService = game:GetService("TweenService")
  local info = TweenInfo.new(0.28, Enum.EasingStyle.Quint, Enum.EasingDirection.Out)
  local start = frame.BackgroundTransparency
  frame.BackgroundTransparency = 1
  local tween = tweenService:Create(frame, info, {
    BackgroundTransparency = start,
  })
  tween:Play()
  task.wait(0.04)
  if frame.BackgroundTransparency > 0.9 then
    frame.BackgroundTransparency = start
  end
  return tween
end

--@quantum:turbo
local function bindDraggable(frame)
  local dragging = false
  local dragStart = Vector2.new(0, 0)
  local startPosition = UDim2.new(0, 0, 0, 0)
  local inputBegan = frame.InputBegan:Connect(function(input)
    if input.UserInputType ~= Enum.UserInputType.MouseButton1 then
      return
    end
    dragging = true
    dragStart = input.Position
    startPosition = frame.Position
  end)
  local inputChanged = UserInputService.InputChanged:Connect(function(input)
    if not dragging then
      return
    end
    if input.UserInputType ~= Enum.UserInputType.MouseMovement then
      return
    end
    local delta = input.Position - dragStart
    frame.Position = UDim2.new(
      startPosition.X.Scale,
      startPosition.X.Offset + delta.X,
      startPosition.Y.Scale,
      startPosition.Y.Offset + delta.Y
    )
  end)
  local inputEnded = UserInputService.InputEnded:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 then
      dragging = false
    end
  end)
  return {
    began = inputBegan,
    changed = inputChanged,
    ended = inputEnded,
    stop = function()
      dragging = false
    end,
  }
end

--@quantum:turbo
local function filterChildren(parent, query)
  local results = {}
  local needle = string.lower(query)
  local children = parent:GetChildren()
  for _, child in ipairs(children) do
    if child:IsA("GuiObject") then
      local name = string.lower(child.Name)
      if string.find(name, needle, 1, true) ~= nil then
        table.insert(results, child)
      elseif child:FindFirstChildOfClass("TextLabel") ~= nil then
        local label = child:FindFirstChildOfClass("TextLabel")
        if string.find(string.lower(label.Text), needle, 1, true) ~= nil then
          table.insert(results, child)
        end
      end
    end
  end
  table.sort(results, function(left, right)
    return left.Name < right.Name
  end)
  return results
end

--@quantum:turbo
local function createStatusBar(root, text)
  local bar = Instance.new("Frame")
  bar.Name = "StatusBar"
  bar.Size = UDim2.new(1, -28, 0, 26)
  bar.Position = UDim2.new(0, 14, 1, -40)
  bar.BackgroundColor3 = Color3.fromRGB(20, 22, 30)
  bar.BorderSizePixel = 0
  bar.Parent = root
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(0, 5)
  corner.Parent = bar
  local dot = Instance.new("Frame")
  dot.Name = "Dot"
  dot.Size = UDim2.new(0, 6, 0, 6)
  dot.Position = UDim2.new(0, 9, 0.5, -3)
  dot.BackgroundColor3 = Color3.fromRGB(72, 190, 128)
  dot.BorderSizePixel = 0
  dot.Parent = bar
  local dotCorner = Instance.new("UICorner")
  dotCorner.CornerRadius = UDim.new(1, 0)
  dotCorner.Parent = dot
  local label = Instance.new("TextLabel")
  label.Name = "Text"
  label.Size = UDim2.new(1, -28, 1, 0)
  label.Position = UDim2.new(0, 22, 0, 0)
  label.BackgroundTransparency = 1
  if #text > 0 then
    label.Text = text
  else
    label.Text = "Ready"
  end
  label.TextColor3 = Color3.fromRGB(144, 148, 166)
  label.TextSize = 11
  label.TextXAlignment = Enum.TextXAlignment.Left
  label.Font = Enum.Font.Gotham
  label.Parent = bar
  local pulse = Instance.new("Frame")
  pulse.Name = "Pulse"
  pulse.Size = UDim2.new(0, 28, 0, 2)
  pulse.Position = UDim2.new(1, -38, 0.5, -1)
  pulse.BackgroundColor3 = Color3.fromRGB(72, 190, 128)
  pulse.BackgroundTransparency = 0.35
  pulse.BorderSizePixel = 0
  pulse.Parent = bar
  return bar
end

--@quantum:turbo
local function collectMetrics(root)
  local metrics = {
    Frames = 0,
    TextLabels = 0,
    TextButtons = 0,
    TextBoxes = 0,
    ScrollingFrames = 0,
  }
  local descendants = root:GetDescendants()
  for _, item in ipairs(descendants) do
    if item:IsA("Frame") then
      metrics.Frames = metrics.Frames + 1
    elseif item:IsA("TextLabel") then
      metrics.TextLabels = metrics.TextLabels + 1
    elseif item:IsA("TextButton") then
      metrics.TextButtons = metrics.TextButtons + 1
    elseif item:IsA("TextBox") then
      metrics.TextBoxes = metrics.TextBoxes + 1
    elseif item:IsA("ScrollingFrame") then
      metrics.ScrollingFrames = metrics.ScrollingFrames + 1
    end
  end
  metrics.Total = metrics.Frames + metrics.TextLabels + metrics.TextButtons + metrics.TextBoxes
  return metrics
end

--@quantum:turbo
local function buildPanel(parent, config)
  local frame = Instance.new("Frame")
  frame.Name = "Panel"
  frame.Size = UDim2.new(1, 0, 0, 54)
  frame.BackgroundColor3 = Color3.fromRGB(26, 28, 37)
  frame.BorderSizePixel = 0
  frame.Parent = parent
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(0, 6)
  corner.Parent = frame
  local title = Instance.new("TextLabel")
  title.Name = "Title"
  title.Size = UDim2.new(1, -16, 0, 20)
  title.Position = UDim2.new(0, 8, 0, 5)
  title.BackgroundTransparency = 1
  title.Text = config.title or "Panel"
  title.TextColor3 = Color3.fromRGB(224, 228, 242)
  title.TextSize = 13
  title.TextXAlignment = Enum.TextXAlignment.Left
  title.Font = Enum.Font.GothamBold
  title.Parent = frame
  local items = config.items or {}
  for index, item in ipairs(items) do
    local label = Instance.new("TextLabel")
    label.Name = "Item" .. index
    label.Size = UDim2.new(1, -16, 0, 16)
    label.Position = UDim2.new(0, 8, 0, 24 + (index - 1) * 17)
    label.BackgroundTransparency = 1
    if type(item) == "table" then
      label.Text = tostring(item.label or item.name or "Item")
    else
      label.Text = tostring(item)
    end
    label.TextColor3 = Color3.fromRGB(154, 158, 176)
    label.TextSize = 11
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Font = Enum.Font.Gotham
    label.Parent = frame
    if index > 4 then
      label.Visible = false
    end
  end
  if #items > 4 then
    frame.Size = UDim2.new(1, 0, 0, 54 + (#items - 4) * 17)
  end
  return frame
end

--@quantum:turbo
local function createFooter(root)
  local footer = Instance.new("Frame")
  footer.Name = "Footer"
  footer.Size = UDim2.new(1, -28, 0, 22)
  footer.Position = UDim2.new(0, 14, 1, -70)
  footer.BackgroundTransparency = 1
  footer.Parent = root
  local left = Instance.new("TextLabel")
  left.Name = "Left"
  left.Size = UDim2.new(0.6, 0, 1, 0)
  left.BackgroundTransparency = 1
  left.Text = string.format("Quantum UI v%d.%d", 3, 2)
  left.TextColor3 = Color3.fromRGB(118, 122, 142)
  left.TextSize = 10
  left.TextXAlignment = Enum.TextXAlignment.Left
  left.Font = Enum.Font.Gotham
  left.Parent = footer
  local right = Instance.new("TextLabel")
  right.Name = "Right"
  right.Size = UDim2.new(0.4, 0, 1, 0)
  right.Position = UDim2.new(0.6, 0, 0, 0)
  right.BackgroundTransparency = 1
  right.Text = Players.LocalPlayer.Name
  right.TextColor3 = Color3.fromRGB(118, 122, 142)
  right.TextSize = 10
  right.TextXAlignment = Enum.TextXAlignment.Right
  right.Font = Enum.Font.Gotham
  right.Parent = footer
  if #right.Text > 12 then
    right.Text = string.sub(right.Text, 1, 12)
  end
  return footer
end

--@quantum:maximum
local function ComputeLayoutScore(items, compact)
  local score = 0
  for index = 1, #items do
    local item = items[index]
    if type(item) == "number" then
      score = score + item * (index + 1)
    elseif type(item) == "table" then
      local weight = item.weight or 1
      if item.visible == false then
        weight = weight * 0.25
      end
      score = score + weight * (index + 1)
    end
  end
  if compact then
    score = math.floor(score / 2)
  end
  return score
end

--@quantum:maximum
local function ValidateConfig(config)
  if type(config) ~= "table" then
    return false, "config"
  end
  if type(config.title) ~= "string" then
    return false, "title"
  end
  if config.width ~= nil and type(config.width) ~= "number" then
    return false, "width"
  end
  if config.items ~= nil and type(config.items) ~= "table" then
    return false, "items"
  end
  if #(config.items or {}) == 0 then
    return false, "empty"
  end
  return true, "ok"
end

local function runDemo()
  local root = createRoot(nil, 640, 420)
  local header = createHeader(root, "Quantum Settings", "Portable native UI fixture")
  local search = createSearchBox(root, "Search settings")
  local tabs = createTabBar(root, { "General", "Visuals", "Input", "Credits" })
  local section = createSection(root, "Appearance", 1)
  local toggle = createToggle(section, "Enable interface", true)
  local slider = createSlider(section, "Opacity", 0, 1, 0.72)
  local dropdown = createDropdown(section, "Theme", { "Midnight", "Aurora", "Mono" })
  local keybind = createKeybind(section, "Menu key", "RightShift")
  local action = createActionButton(section, "Apply changes", "success")
  local divider = createDivider(section, 2)
  local list = createScrollingList(root, 12)
  local toast = createNotification(root, "Loaded", "All native sections initialized")
  local tooltip = createTooltip(root, "Hover a control to inspect its binding")
  local status = createStatusBar(root, "Synchronizing interface")
  local footer = createFooter(root)
  local panel = buildPanel(root, {
    title = "Diagnostics",
    items = {
      { label = "Renderer" },
      { label = "Input map" },
      { label = "Theme cache" },
      { label = "Native bridges" },
      { label = "Hidden metrics" },
    },
  })
  local inputSection = createSection(root, "Input", 2)
  local secondaryToggle = createToggle(inputSection, "Raw input", false)
  local secondarySlider = createSlider(inputSection, "Deadzone", 0, 0.5, 0.12)
  local secondaryDropdown = createDropdown(inputSection, "Priority", { "Low", "Normal", "High" })
  local secondaryKeybind = createKeybind(inputSection, "Toggle key", "Insert")
  local ghosts = {}
  for index = 1, 6 do
    local ghost = Instance.new("Frame")
    ghost.Name = "Ghost" .. index
    ghost.Size = UDim2.new(1, -8, 0, 24)
    ghost.Position = UDim2.new(0, 4, 0, (index - 1) * 26)
    ghost.BackgroundColor3 = Color3.fromRGB(22, 24, 32)
    ghost.BackgroundTransparency = 0.25
    ghost.BorderSizePixel = 0
    ghost.LayoutOrder = index
    ghost.Parent = panel
    local ghostCorner = Instance.new("UICorner")
    ghostCorner.CornerRadius = UDim.new(0, 4)
    ghostCorner.Parent = ghost
    local ghostBadge = createBadge(ghost, "G" .. index, Color3.fromRGB(64, 84, 160))
    ghostBadge.Position = UDim2.new(1, -64, 0, 2)
    if index % 2 == 0 then
      ghost.BackgroundColor3 = Color3.fromRGB(26, 28, 38)
    end
    table.insert(ghosts, ghost)
  end
  secondaryToggle.set(true)
  secondarySlider.set(0.2)
  secondaryDropdown.select(2)
  secondaryKeybind.set("Home")
  tabs.select(2)
  toggle.set(false)
  toggle.set(true)
  slider.set(0.5)
  dropdown.select(3)
  keybind.set("F")
  layoutChildren(list, 4)
  applyTheme(root, true)
  animateOpen(root)
  bindDraggable(root)
  local found = filterChildren(root, "tab")
  local metrics = collectMetrics(root)
  local score = ComputeLayoutScore({ 2, 4, { weight = 3 }, 6, { weight = 2, visible = false } }, true)
  local valid, reason = ValidateConfig({
    title = "Settings",
    width = 640,
    items = { "Appearance", "Input" },
  })
  local themeName = "midnight"
  local contrast = 0
  if themeName == "midnight" then
    contrast = 24
  else
    contrast = 12
  end
  for index = 1, 3 do
    contrast = contrast + index
  end
  print("contrast", contrast)
  print("A11_READY")
  print(root.Name)
  print("tabs", #found)
  print("metrics", metrics.Total)
  print("score", score)
  print("config", valid, reason)
  print("nodes", #root:GetDescendants())
  print("header", header.Name)
  print("search", search.Name)
  print("list", list.Name)
  print("toast", toast.Name)
  print("tooltip", tooltip.Name)
  print("status", status.Name)
  print("footer", footer.Name)
  print("panel", panel.Name)
  print("divider", divider.Name)
  print("action", action.Name)
end

runDemo()
