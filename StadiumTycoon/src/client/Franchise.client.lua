--[[
	Franchise (client)
	The team-management screens:
	  * button bar on the right: TEAM, ROSTER, QUESTS and the OWNER'S BONUS button
	  * team picker (colours + nickname) - opens by itself the first time you own a stadium
	  * quest tracker (left side)
	  * roster + draft screen
	Everything shown comes from player attributes set by the server (Franchise.lua).
]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))
local Format = require(Shared:WaitForChild("Format"))
local remotes = ReplicatedStorage:WaitForChild("TycoonRemotes")
local chooseTeamRemote = remotes:WaitForChild("ChooseTeam")
local claimBonusRemote = remotes:WaitForChild("ClaimBonus")
local draftRemote = remotes:WaitForChild("Draft")

local DARK = Color3.fromRGB(18, 22, 30)
local GOLD = Color3.fromRGB(255, 196, 37)
local WHITE = Color3.new(1, 1, 1)

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

local function label(props)
	props.BackgroundTransparency = props.BackgroundTransparency or 1
	props.Font = props.Font or Enum.Font.GothamBold
	props.TextColor3 = props.TextColor3 or WHITE
	props.TextScaled = true
	return create("TextLabel", props)
end

local function button(props, children)
	props.Font = props.Font or Enum.Font.GothamBlack
	props.TextColor3 = props.TextColor3 or WHITE
	props.TextScaled = true
	props.AutoButtonColor = true
	local b = create("TextButton", props, children)
	corner(10).Parent = b
	return b
end

local function decode(json, fallback)
	if type(json) ~= "string" or json == "" then
		return fallback
	end
	local ok, result = pcall(function()
		return HttpService:JSONDecode(json)
	end)
	return ok and result or fallback
end

local screen = create("ScreenGui", {
	Name = "FranchiseUI",
	ResetOnSpawn = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	Parent = player:WaitForChild("PlayerGui"),
})

---------------------------------------------------------------------------------------------
-- Button bar (right side)
---------------------------------------------------------------------------------------------
local bar = create("Frame", {
	Name = "ButtonBar",
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim2.new(1, -10, 0.5, 0),
	Size = UDim2.new(0, 116, 0, 230),
	BackgroundTransparency = 1,
	Parent = screen,
}, {
	create("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }),
})
local bonusButton = button({
	Name = "Bonus",
	LayoutOrder = 1,
	Size = UDim2.new(1, 0, 0, 54),
	BackgroundColor3 = GOLD,
	TextColor3 = DARK,
	Text = "BONUS",
	Parent = bar,
})
local teamButton =
	button({ Name = "Team", LayoutOrder = 2, Size = UDim2.new(1, 0, 0, 40), BackgroundColor3 = DARK, Text = "TEAM", Parent = bar })
local rosterButton =
	button({ Name = "Roster", LayoutOrder = 3, Size = UDim2.new(1, 0, 0, 40), BackgroundColor3 = DARK, Text = "ROSTER", Parent = bar })
local questsButton = button({
	Name = "QuestsToggle",
	LayoutOrder = 4,
	Size = UDim2.new(1, 0, 0, 40),
	BackgroundColor3 = DARK,
	Text = "QUESTS",
	Parent = bar,
})

---------------------------------------------------------------------------------------------
-- Owner's Bonus
---------------------------------------------------------------------------------------------
local function clock(seconds)
	seconds = math.max(0, math.floor(seconds))
	return ("%d:%02d"):format(math.floor(seconds / 60), seconds % 60)
end

local function updateBonus()
	local hasPlot = player:GetAttribute("PlotIndex") ~= nil
	bar.Visible = hasPlot
	local readyAt = player:GetAttribute("BonusReadyAt")
	if not readyAt then
		bonusButton.Text = "BONUS"
		return
	end
	local left = readyAt - Workspace:GetServerTimeNow()
	if left <= 0 then
		bonusButton.Text = "CLAIM\nOWNER'S BONUS!"
		bonusButton.BackgroundColor3 = GOLD
		bonusButton.TextColor3 = DARK
		bonusButton.BackgroundTransparency = (math.sin(os.clock() * 6) + 1) * 0.12
	else
		bonusButton.Text = "BONUS IN\n" .. clock(left)
		bonusButton.BackgroundColor3 = DARK
		bonusButton.TextColor3 = Color3.fromRGB(200, 200, 205)
		bonusButton.BackgroundTransparency = 0.2
	end
end

bonusButton.Activated:Connect(function()
	claimBonusRemote:FireServer()
end)

---------------------------------------------------------------------------------------------
-- Quest tracker (left side)
---------------------------------------------------------------------------------------------
local questPanel = create("Frame", {
	Name = "Quests",
	AnchorPoint = Vector2.new(0, 0.5),
	Position = UDim2.new(0, 10, 0.5, 0),
	Size = UDim2.new(0, 250, 0, 200),
	BackgroundColor3 = DARK,
	BackgroundTransparency = 0.25,
	Visible = false,
	Parent = screen,
}, { corner(12), create("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10), PaddingTop = UDim.new(0, 8) }) })
local questTitle = label({
	Name = "Title",
	Size = UDim2.new(1, 0, 0, 22),
	Text = "QUESTS",
	TextColor3 = GOLD,
	Font = Enum.Font.GothamBlack,
	Parent = questPanel,
})
local questRows = {}
for index = 1, 3 do
	local row = create("Frame", {
		Name = "Quest" .. index,
		Position = UDim2.new(0, 0, 0, 26 + (index - 1) * 56),
		Size = UDim2.new(1, 0, 0, 52),
		BackgroundTransparency = 1,
		Parent = questPanel,
	})
	local text = label({ Name = "Text", Size = UDim2.new(1, 0, 0, 20), TextXAlignment = Enum.TextXAlignment.Left, Text = "", Parent = row })
	local track = create("Frame", {
		Name = "Track",
		Position = UDim2.new(0, 0, 0, 23),
		Size = UDim2.new(1, 0, 0, 10),
		BackgroundColor3 = Color3.fromRGB(60, 64, 75),
		Parent = row,
	}, { corner(5) })
	local fill = create(
		"Frame",
		{ Name = "Fill", Size = UDim2.new(0, 0, 1, 0), BackgroundColor3 = Color3.fromRGB(90, 220, 120), Parent = track },
		{ corner(5) }
	)
	local reward = label({
		Name = "Reward",
		Position = UDim2.new(0, 0, 0, 35),
		Size = UDim2.new(1, 0, 0, 15),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(255, 225, 120),
		Text = "",
		Parent = row,
	})
	questRows[index] = { row = row, text = text, fill = fill, reward = reward }
end
local questsWanted = true

local function updateQuests()
	local quests = decode(player:GetAttribute("Quests"), {})
	local done = player:GetAttribute("QuestsDone") or 0
	local total = player:GetAttribute("QuestsTotal") or 0
	questTitle.Text = ("QUESTS  %d/%d"):format(done, total)
	for index, rowInfo in ipairs(questRows) do
		local quest = quests[index]
		rowInfo.row.Visible = quest ~= nil
		if quest then
			rowInfo.text.Text = quest.Text
			local fraction = quest.Goal > 0 and math.clamp(quest.Progress / quest.Goal, 0, 1) or 0
			rowInfo.fill.Size = UDim2.new(fraction, 0, 1, 0)
			local progressText = quest.Goal > 1 and (Format.Short(quest.Progress) .. " / " .. Format.Short(quest.Goal) .. "   ") or ""
			rowInfo.reward.Text = progressText .. "Reward " .. Format.Money(quest.Reward)
		end
	end
	questPanel.Visible = questsWanted and player:GetAttribute("PlotIndex") ~= nil and #quests > 0
end

questsButton.Activated:Connect(function()
	questsWanted = not questsWanted
	updateQuests()
end)

---------------------------------------------------------------------------------------------
-- Modal windows
---------------------------------------------------------------------------------------------
local function modal(name, title)
	local frame = create("Frame", {
		Name = name,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.5, 0),
		Size = UDim2.new(0.9, 0, 0.8, 0),
		BackgroundColor3 = DARK,
		BackgroundTransparency = 0.05,
		Visible = false,
		Parent = screen,
	}, {
		corner(16),
		create("UISizeConstraint", { MaxSize = Vector2.new(560, 470) }),
		create("UIStroke", { Color = GOLD, Thickness = 2 }),
	})
	label({
		Name = "Title",
		Position = UDim2.new(0, 16, 0, 10),
		Size = UDim2.new(1, -80, 0, 34),
		Text = title,
		TextColor3 = GOLD,
		Font = Enum.Font.GothamBlack,
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = frame,
	})
	local close = button({
		Name = "Close",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -10, 0, 10),
		Size = UDim2.new(0, 40, 0, 34),
		BackgroundColor3 = Color3.fromRGB(190, 52, 52),
		Text = "X",
		Parent = frame,
	})
	close.Activated:Connect(function()
		frame.Visible = false
	end)
	return frame
end

---------------------------------------------------------------------------------------------
-- Team picker
---------------------------------------------------------------------------------------------
local teamWindow = modal("TeamPicker", "PICK YOUR TEAM")
local chosenPalette, chosenNickname = 1, 1
local preview = label({
	Name = "Preview",
	Position = UDim2.new(0, 16, 0, 48),
	Size = UDim2.new(1, -32, 0, 40),
	Font = Enum.Font.GothamBlack,
	BackgroundTransparency = 0,
	Text = "",
	Parent = teamWindow,
})
corner(10).Parent = preview
label({
	Name = "ColoursLabel",
	Position = UDim2.new(0, 16, 0, 96),
	Size = UDim2.new(1, -32, 0, 20),
	Text = "COLOURS",
	TextXAlignment = Enum.TextXAlignment.Left,
	Parent = teamWindow,
})
local swatches = create("Frame", {
	Name = "Swatches",
	Position = UDim2.new(0, 16, 0, 118),
	Size = UDim2.new(1, -32, 0, 50),
	BackgroundTransparency = 1,
	Parent = teamWindow,
}, {
	create(
		"UIGridLayout",
		{ CellSize = UDim2.new(1 / 6, -6, 1, 0), CellPadding = UDim2.new(0, 6, 0, 0), SortOrder = Enum.SortOrder.LayoutOrder }
	),
})
label({
	Name = "NamesLabel",
	Position = UDim2.new(0, 16, 0, 176),
	Size = UDim2.new(1, -32, 0, 20),
	Text = "NICKNAME",
	TextXAlignment = Enum.TextXAlignment.Left,
	Parent = teamWindow,
})
local names = create("Frame", {
	Name = "Nicknames",
	Position = UDim2.new(0, 16, 0, 198),
	Size = UDim2.new(1, -32, 1, -270),
	BackgroundTransparency = 1,
	Parent = teamWindow,
}, {
	create(
		"UIGridLayout",
		{ CellSize = UDim2.new(1 / 3, -6, 0, 36), CellPadding = UDim2.new(0, 6, 0, 6), SortOrder = Enum.SortOrder.LayoutOrder }
	),
})
local confirm = button({
	Name = "Confirm",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -12),
	Size = UDim2.new(0.6, 0, 0, 44),
	BackgroundColor3 = Color3.fromRGB(34, 150, 80),
	Text = "THAT'S MY TEAM!",
	Parent = teamWindow,
})

local swatchButtons, nameButtons = {}, {}
local function refreshPicker()
	local palette = Config.TeamColors[chosenPalette]
	local nickname = Config.TeamNicknames[chosenNickname]
	preview.Text = ("%s'S %s"):format(string.upper(player.DisplayName), string.upper(nickname))
	preview.BackgroundColor3 = palette.Primary
	preview.TextColor3 = palette.Trim
	for index, b in ipairs(swatchButtons) do
		b.BorderSizePixel = 0
		local stroke = b:FindFirstChildOfClass("UIStroke")
		if stroke then
			stroke.Thickness = index == chosenPalette and 4 or 0
		end
	end
	for index, b in ipairs(nameButtons) do
		b.BackgroundColor3 = index == chosenNickname and palette.Primary or Color3.fromRGB(50, 55, 66)
	end
end

for index, palette in ipairs(Config.TeamColors) do
	local swatch = button(
		{ Name = "Palette" .. index, LayoutOrder = index, BackgroundColor3 = palette.Primary, Text = "", Parent = swatches },
		{
			create("UIStroke", { Color = WHITE, Thickness = 0, ApplyStrokeMode = Enum.ApplyStrokeMode.Border }),
			create("Frame", {
				Name = "Second",
				AnchorPoint = Vector2.new(1, 1),
				Position = UDim2.new(1, -4, 1, -4),
				Size = UDim2.new(0.45, 0, 0.45, 0),
				BackgroundColor3 = palette.Secondary,
			}),
		}
	)
	swatch.Activated:Connect(function()
		chosenPalette = index
		refreshPicker()
	end)
	swatchButtons[index] = swatch
end
for index, nickname in ipairs(Config.TeamNicknames) do
	local nameButton = button({
		Name = "Nickname" .. index,
		LayoutOrder = index,
		BackgroundColor3 = Color3.fromRGB(50, 55, 66),
		Text = string.upper(nickname),
		Font = Enum.Font.GothamBold,
		Parent = names,
	})
	nameButton.Activated:Connect(function()
		chosenNickname = index
		refreshPicker()
	end)
	nameButtons[index] = nameButton
end
confirm.Activated:Connect(function()
	chooseTeamRemote:FireServer(chosenPalette, chosenNickname)
	teamWindow.Visible = false
end)
teamButton.Activated:Connect(function()
	refreshPicker()
	teamWindow.Visible = not teamWindow.Visible
end)
refreshPicker()

---------------------------------------------------------------------------------------------
-- Roster + draft
---------------------------------------------------------------------------------------------
local rosterWindow = modal("RosterWindow", "ROSTER & DRAFT")
local ratingLabel = label({
	Name = "Rating",
	Position = UDim2.new(0, 16, 0, 48),
	Size = UDim2.new(0.5, -16, 0, 30),
	Text = "",
	TextXAlignment = Enum.TextXAlignment.Left,
	Font = Enum.Font.GothamBlack,
	Parent = rosterWindow,
})
local recordLabel = label({
	Name = "Record",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -16, 0, 48),
	Size = UDim2.new(0.5, -16, 0, 30),
	Text = "",
	TextXAlignment = Enum.TextXAlignment.Right,
	Parent = rosterWindow,
})
local rosterList = create("Frame", {
	Name = "List",
	Position = UDim2.new(0, 16, 0, 86),
	Size = UDim2.new(1, -32, 1, -170),
	BackgroundTransparency = 1,
	Parent = rosterWindow,
}, {
	create("UIListLayout", { Padding = UDim.new(0, 5), SortOrder = Enum.SortOrder.LayoutOrder }),
})
local draftButton = button({
	Name = "DraftButton",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -34),
	Size = UDim2.new(0.7, 0, 0, 44),
	BackgroundColor3 = Color3.fromRGB(34, 150, 80),
	Text = "DRAFT A PLAYER",
	Parent = rosterWindow,
})
local draftInfo = label({
	Name = "DraftInfo",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -8),
	Size = UDim2.new(1, -32, 0, 22),
	Text = "",
	TextColor3 = Color3.fromRGB(200, 200, 205),
	Parent = rosterWindow,
})

local rosterRows = {}
for index, pos in ipairs(Config.Draft.Positions) do
	local row = create("Frame", {
		Name = "Row" .. pos,
		LayoutOrder = index,
		Size = UDim2.new(1, 0, 0, 34),
		BackgroundColor3 = Color3.fromRGB(40, 45, 56),
		Parent = rosterList,
	}, { corner(8) })
	label({
		Name = "Pos",
		Position = UDim2.new(0, 8, 0, 4),
		Size = UDim2.new(0, 56, 1, -8),
		Text = pos,
		TextColor3 = GOLD,
		Font = Enum.Font.GothamBlack,
		Parent = row,
	})
	local nameLabel = label({
		Name = "Name",
		Position = UDim2.new(0, 72, 0, 4),
		Size = UDim2.new(1, -140, 1, -8),
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = row,
	})
	local ratingText = label({
		Name = "Rating",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -8, 0, 4),
		Size = UDim2.new(0, 54, 1, -8),
		Text = "",
		Font = Enum.Font.GothamBlack,
		Parent = row,
	})
	rosterRows[pos] = { name = nameLabel, rating = ratingText }
end

local function ratingColor(rating)
	if rating >= 85 then
		return Color3.fromRGB(110, 255, 140)
	elseif rating >= 70 then
		return Color3.fromRGB(255, 225, 90)
	end
	return Color3.fromRGB(255, 150, 150)
end

local function updateRoster()
	local roster = decode(player:GetAttribute("Roster"), {})
	for _, entry in ipairs(roster) do
		local row = rosterRows[entry.Pos]
		if row then
			if entry.Name ~= "" then
				row.name.Text = entry.Name
				row.rating.Text = tostring(entry.Rating)
				row.rating.TextColor3 = ratingColor(entry.Rating)
			else
				row.name.Text = "(empty - draft someone!)"
				row.rating.Text = "-"
				row.rating.TextColor3 = Color3.fromRGB(150, 150, 155)
			end
		end
	end
	local rating = player:GetAttribute("TeamRating") or 0
	ratingLabel.Text = "TEAM RATING " .. tostring(rating)
	ratingLabel.TextColor3 = ratingColor(rating)
	recordLabel.Text = "RECORD " .. tostring(player:GetAttribute("Record") or "0-0")
	local unlocked = player:GetAttribute("DraftUnlocked") == true
	local cost = player:GetAttribute("DraftCost") or 0
	draftButton.Text = unlocked and ("DRAFT A PLAYER  " .. Format.MoneyExact(cost)) or "DRAFT LOCKED"
	draftButton.BackgroundColor3 = unlocked and Color3.fromRGB(34, 150, 80) or Color3.fromRGB(80, 80, 90)
	draftInfo.Text = unlocked and "Better coaches + film room = better draft picks. Win game days with a high rating!"
		or "Build the Draft Board in your Front Office to unlock the draft."
end

local drafting = false
draftButton.Activated:Connect(function()
	if drafting then
		return
	end
	drafting = true
	local ok, result = pcall(function()
		return draftRemote:InvokeServer()
	end)
	drafting = false
	if ok and type(result) == "table" and not result.ok and result.message then
		draftInfo.Text = result.message
	end
end)
rosterButton.Activated:Connect(function()
	updateRoster()
	rosterWindow.Visible = not rosterWindow.Visible
end)

---------------------------------------------------------------------------------------------
-- Wiring
---------------------------------------------------------------------------------------------
local pickerShown = false
local function onPlotOrTeam()
	updateQuests()
	updateBonus()
	if player:GetAttribute("PlotIndex") ~= nil and player:GetAttribute("TeamChosen") == false and not pickerShown then
		pickerShown = true
		refreshPicker()
		teamWindow.Visible = true
	end
end

for _, attribute in ipairs({ "Quests", "QuestsDone" }) do
	player:GetAttributeChangedSignal(attribute):Connect(updateQuests)
end
for _, attribute in ipairs({ "Roster", "TeamRating", "Record", "DraftCost", "DraftUnlocked" }) do
	player:GetAttributeChangedSignal(attribute):Connect(updateRoster)
end
player:GetAttributeChangedSignal("PlotIndex"):Connect(onPlotOrTeam)
player:GetAttributeChangedSignal("TeamChosen"):Connect(onPlotOrTeam)
onPlotOrTeam()
updateRoster()

task.spawn(function()
	while true do
		updateBonus()
		task.wait(0.25)
	end
end)
