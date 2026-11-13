--[[
	HUD
	Shows the player's cash, income per second, build progress, save status and pop-up messages.
	Everything it shows comes from player attributes set by the server (Cash, Income, Built,
	PlotIndex, SaveStatus) and from the TycoonRemotes.Notify RemoteEvent.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Format = require(Shared:WaitForChild("Format"))
local Items = require(Shared:WaitForChild("Items"))
local notifyRemote = ReplicatedStorage:WaitForChild("TycoonRemotes"):WaitForChild("Notify")

local TOAST_COLORS = {
	success = Color3.fromRGB(34, 150, 80),
	error = Color3.fromRGB(190, 52, 52),
	cash = Color3.fromRGB(205, 150, 20),
	info = Color3.fromRGB(45, 100, 190),
}
local MAX_TOASTS = 5
local TOAST_HEIGHT = 40
local TOAST_GAP = 6
local CLAIM_HINT = "Walk through a glowing GOLD GATE to claim your stadium!"
local FULL_HINT = "All stadiums are taken right now - one opens when a player leaves."
local TOAST_SECONDS = 3.5

local function create(className, props, children)
	local instance = Instance.new(className)
	for key, value in pairs(props) do
		if key ~= "Parent" then
			instance[key] = value
		end
	end
	for _, child in ipairs(children or {}) do
		child.Parent = instance
	end
	instance.Parent = props.Parent
	return instance
end

local function corner(radius)
	return create("UICorner", { CornerRadius = UDim.new(0, radius) })
end

---------------------------------------------------------------------------------------------
-- Layout
---------------------------------------------------------------------------------------------
local screen = create("ScreenGui", {
	Name = "TycoonHUD",
	ResetOnSpawn = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	Parent = player:WaitForChild("PlayerGui"),
})

local cashScale = create("UIScale", { Scale = 1 })
local cashPanel = create("Frame", {
	Name = "CashPanel",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 8),
	Size = UDim2.new(0, 270, 0, 78),
	BackgroundColor3 = Color3.fromRGB(18, 22, 30),
	BackgroundTransparency = 0.2,
	Parent = screen,
}, {
	corner(14),
	create("UIStroke", { Color = Color3.fromRGB(255, 196, 37), Thickness = 2, Transparency = 0.2 }),
	cashScale,
})

local cashLabel = create("TextLabel", {
	Name = "Cash",
	Position = UDim2.new(0, 12, 0, 4),
	Size = UDim2.new(1, -24, 0, 46),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBlack,
	Text = "$0",
	TextColor3 = Color3.fromRGB(110, 255, 140),
	TextScaled = true,
	Parent = cashPanel,
})

local incomeLabel = create("TextLabel", {
	Name = "Income",
	Position = UDim2.new(0, 12, 0, 50),
	Size = UDim2.new(1, -24, 0, 22),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBold,
	Text = "+$0/s",
	TextColor3 = Color3.fromRGB(230, 230, 235),
	TextScaled = true,
	Parent = cashPanel,
})

local progressLabel = create("TextLabel", {
	Name = "Progress",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 90),
	Size = UDim2.new(0, 270, 0, 22),
	BackgroundColor3 = Color3.fromRGB(18, 22, 30),
	BackgroundTransparency = 0.35,
	Font = Enum.Font.GothamBold,
	Text = "",
	TextColor3 = Color3.fromRGB(255, 220, 120),
	TextScaled = true,
	Visible = false,
	Parent = screen,
}, { corner(8) })

local hintLabel = create("TextLabel", {
	Name = "Hint",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 92),
	Size = UDim2.new(0.9, 0, 0, 34),
	BackgroundColor3 = Color3.fromRGB(255, 196, 37),
	BackgroundTransparency = 0.1,
	Font = Enum.Font.GothamBlack,
	Text = CLAIM_HINT,
	TextColor3 = Color3.fromRGB(25, 25, 30),
	TextScaled = true,
	Parent = screen,
}, {
	corner(10),
	create("UISizeConstraint", { MaxSize = Vector2.new(620, 34) }),
	create("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10) }),
})

local saveLabel = create("TextLabel", {
	Name = "SaveStatus",
	AnchorPoint = Vector2.new(0, 1),
	Position = UDim2.new(0, 10, 1, -10),
	Size = UDim2.new(0, 190, 0, 20),
	BackgroundColor3 = Color3.fromRGB(18, 22, 30),
	BackgroundTransparency = 0.4,
	Font = Enum.Font.GothamBold,
	Text = "Loading save...",
	TextColor3 = Color3.fromRGB(220, 220, 225),
	TextScaled = true,
	Parent = screen,
}, { corner(6) })

-- Pop-up messages stack upward from the bottom centre (clear of the player list, the chat,
-- and the mobile thumbstick / jump button).
local toastContainer = create("Frame", {
	Name = "Toasts",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -40),
	Size = UDim2.new(0.9, 0, 0, MAX_TOASTS * (TOAST_HEIGHT + TOAST_GAP)),
	BackgroundTransparency = 1,
	Parent = screen,
}, {
	create("UISizeConstraint", { MaxSize = Vector2.new(440, MAX_TOASTS * (TOAST_HEIGHT + TOAST_GAP)) }),
	create("UIListLayout", {
		Padding = UDim.new(0, TOAST_GAP),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
	}),
})

---------------------------------------------------------------------------------------------
-- Cash (counts up smoothly) / income / progress / save status
---------------------------------------------------------------------------------------------
local shownCash = Instance.new("NumberValue")
shownCash.Value = player:GetAttribute("Cash") or 0
shownCash.Changed:Connect(function(value)
	cashLabel.Text = Format.MoneyExact(value)
end)
cashLabel.Text = Format.MoneyExact(shownCash.Value)

local cashTween = nil
local function onCashChanged()
	local cash = player:GetAttribute("Cash") or 0
	if cashTween then
		cashTween:Cancel()
	end
	local increased = cash > shownCash.Value
	cashTween = TweenService:Create(shownCash, TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Value = cash })
	cashTween:Play()
	if increased then
		cashScale.Scale = 1.08
		TweenService:Create(cashScale, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
	end
end

local function onIncomeChanged()
	local income = player:GetAttribute("Income") or 0
	incomeLabel.Text = ("+%s/s"):format(Format.Money(income))
end

local tycoonsFolder = Workspace:WaitForChild("Tycoons", 10)

local function onPlotChanged()
	local hasPlot = player:GetAttribute("PlotIndex") ~= nil
	hintLabel.Visible = not hasPlot
	progressLabel.Visible = hasPlot
	local freePlots = tycoonsFolder and tycoonsFolder:GetAttribute("FreePlots")
	hintLabel.Text = (freePlots == 0) and FULL_HINT or CLAIM_HINT
end

local function onBuiltChanged()
	local built = player:GetAttribute("Built") or 0
	local total = #Items.List
	if built >= total then
		progressLabel.Text = ("STADIUM COMPLETE  %d/%d"):format(built, total)
	else
		progressLabel.Text = ("Stadium pieces built: %d / %d"):format(built, total)
	end
end

local function onSaveStatusChanged()
	local status = player:GetAttribute("SaveStatus")
	if status == "on" then
		saveLabel.Text = "Progress saving: ON"
		saveLabel.TextColor3 = Color3.fromRGB(140, 255, 160)
	elseif status == "off" then
		saveLabel.Text = "Progress saving: OFF"
		saveLabel.TextColor3 = Color3.fromRGB(255, 150, 150)
	elseif status == "loadfailed" then
		saveLabel.Text = "Save didn't load - rejoin later"
		saveLabel.TextColor3 = Color3.fromRGB(255, 190, 120)
	else
		saveLabel.Text = "Loading save..."
		saveLabel.TextColor3 = Color3.fromRGB(220, 220, 225)
	end
end

player:GetAttributeChangedSignal("Cash"):Connect(onCashChanged)
player:GetAttributeChangedSignal("Income"):Connect(onIncomeChanged)
player:GetAttributeChangedSignal("PlotIndex"):Connect(onPlotChanged)
player:GetAttributeChangedSignal("Built"):Connect(onBuiltChanged)
player:GetAttributeChangedSignal("SaveStatus"):Connect(onSaveStatusChanged)
if tycoonsFolder then
	tycoonsFolder:GetAttributeChangedSignal("FreePlots"):Connect(onPlotChanged)
end
onCashChanged()
onIncomeChanged()
onPlotChanged()
onBuiltChanged()
onSaveStatusChanged()

---------------------------------------------------------------------------------------------
-- Toast notifications
---------------------------------------------------------------------------------------------
local toastOrder = 0
local cashToast = nil -- the current "+$X" toast, reused so collecting doesn't stack up toasts

local function fadeOut(toast)
	local tweenInfo = TweenInfo.new(0.4)
	for _, descendant in ipairs(toast:GetDescendants()) do
		if descendant:IsA("TextLabel") then
			TweenService:Create(descendant, tweenInfo, { TextTransparency = 1 }):Play()
		end
	end
	local tween = TweenService:Create(toast, tweenInfo, { BackgroundTransparency = 1 })
	tween:Play()
	tween.Completed:Wait()
	toast:Destroy()
end

-- Fades the toast after TOAST_SECONDS unless it was refreshed in the meantime.
local function scheduleFade(toast)
	local token = (toast:GetAttribute("FadeToken") or 0) + 1
	toast:SetAttribute("FadeToken", token)
	task.delay(TOAST_SECONDS, function()
		if toast.Parent and toast:GetAttribute("FadeToken") == token then
			fadeOut(toast)
		end
	end)
end

-- How many toasts fit without covering the middle of small (phone) screens.
local function maxToasts()
	local ok, size = pcall(function()
		return screen.AbsoluteSize
	end)
	if not ok or size.Y <= 0 then
		return MAX_TOASTS -- not laid out yet
	end
	return math.clamp(math.floor(size.Y * 0.4 / (TOAST_HEIGHT + TOAST_GAP)), 2, MAX_TOASTS)
end

local function showToast(message, kind)
	toastOrder += 1
	if kind == "cash" and cashToast and cashToast.Parent then
		cashToast.LayoutOrder = toastOrder
		cashToast:FindFirstChildOfClass("TextLabel").Text = tostring(message)
		scheduleFade(cashToast)
		return
	end

	local toast = create("Frame", {
		Name = "Toast",
		LayoutOrder = toastOrder,
		Size = UDim2.new(1, 0, 0, TOAST_HEIGHT),
		BackgroundColor3 = TOAST_COLORS[kind] or TOAST_COLORS.info,
		BackgroundTransparency = 0.1,
		Parent = toastContainer,
	}, {
		corner(10),
		create("TextLabel", {
			Size = UDim2.new(1, -16, 1, -8),
			Position = UDim2.new(0, 8, 0, 4),
			BackgroundTransparency = 1,
			Font = Enum.Font.GothamBold,
			Text = tostring(message),
			TextColor3 = Color3.new(1, 1, 1),
			TextScaled = true,
			TextWrapped = true,
		}),
	})
	if kind == "cash" then
		cashToast = toast
	end

	-- keep only the newest few
	local toasts = {}
	for _, child in ipairs(toastContainer:GetChildren()) do
		if child:IsA("Frame") then
			table.insert(toasts, child)
		end
	end
	table.sort(toasts, function(a, b)
		return a.LayoutOrder < b.LayoutOrder
	end)
	for index = 1, #toasts - maxToasts() do
		toasts[index]:Destroy()
	end

	scheduleFade(toast)
end

notifyRemote.OnClientEvent:Connect(showToast)
