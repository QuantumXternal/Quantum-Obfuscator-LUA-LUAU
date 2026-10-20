--@quantum:maximum
local function CriticalLogic()
    local total = 0
    for i = 1, 3 do
        total += i
    end
    return total
end

--@quantum:turbo
local function HeavyUI()
    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, 0, 1, 0)
    frame.Visible = true
    return frame
end

print(CriticalLogic())
