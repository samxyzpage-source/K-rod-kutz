--[[
	Prints the instance tree of a built place file and checks the important pieces exist.
	Usage: lune run tools/inspect_place.luau build/StadiumTycoon.rbxlx
]]
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")

local path = process.args[1] or "build/StadiumTycoon.rbxlx"
local game = roblox.deserializePlace(fs.readFile(path))

local function walk(inst, depth)
	if depth > 4 then
		return
	end
	local extra = ""
	if inst:IsA("LuaSourceContainer") then
		local source = inst.Source
		extra = (" (%d lines)"):format(select(2, source:gsub("\n", "")) + 1)
	end
	print(string.rep("  ", depth) .. inst.Name .. " [" .. inst.ClassName .. "]" .. extra)
	for _, child in ipairs(inst:GetChildren()) do
		walk(child, depth + 1)
	end
end

for _, serviceName in ipairs({ "Workspace", "Lighting", "ReplicatedStorage", "ServerScriptService", "StarterPlayer" }) do
	local service = game:GetService(serviceName)
	walk(service, 0)
end

local ground = game:GetService("Workspace"):FindFirstChild("Ground")
print("\nGround:", ground.Size, ground.CFrame.Position, ground.Material, ground.Anchored)
local spawn = game:GetService("Workspace"):FindFirstChild("SpawnLocation")
print("Spawn:", spawn.Size, spawn.CFrame.Position, spawn.Neutral, spawn.Duration)
local lighting = game:GetService("Lighting")
print("Lighting:", lighting.ClockTime, lighting.Technology, lighting.Brightness)
print("Workspace.StreamingEnabled:", game:GetService("Workspace").StreamingEnabled)

local required = {
	{ "ServerScriptService", "TycoonServer", "Main", "Script" },
	{ "ServerScriptService", "TycoonServer", "PlotManager", "ModuleScript" },
	{ "ServerScriptService", "TycoonServer", "PlayerData", "ModuleScript" },
	{ "ServerScriptService", "TycoonServer", "World", "ModuleScript" },
	{ "ServerScriptService", "TycoonServer", "BuildUtil", "ModuleScript" },
	{ "ServerScriptService", "TycoonServer", "Builders", "ModuleScript" },
	{ "ReplicatedStorage", "TycoonShared", "Config", "ModuleScript" },
	{ "ReplicatedStorage", "TycoonShared", "Items", "ModuleScript" },
	{ "ReplicatedStorage", "TycoonShared", "Format", "ModuleScript" },
}
local ok = true
for _, req in ipairs(required) do
	local inst = game:GetService(req[1]):FindFirstChild(req[2])
	inst = inst and inst:FindFirstChild(req[3])
	if not inst or inst.ClassName ~= req[4] then
		print("MISSING: " .. table.concat(req, "/"))
		ok = false
	end
end
local hud = game:GetService("StarterPlayer"):FindFirstChild("StarterPlayerScripts")
hud = hud and hud:FindFirstChild("TycoonClient")
hud = hud and hud:FindFirstChild("HUD")
if not hud or hud.ClassName ~= "LocalScript" then
	print("MISSING: StarterPlayerScripts/TycoonClient/HUD LocalScript")
	ok = false
end
print(ok and "\nPlace file OK" or "\nPlace file has problems")
if not ok then
	process.exit(1)
end
