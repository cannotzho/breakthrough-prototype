extends Node
# Drives the C# engine through EngineGateway from plain GDScript — the interop
# proof for the GDScript side of the boundary. Engine state is not directly
# Variant-readable (CombatState is a plain .NET type), so it crosses as JSON
# (GetStateJson / GetState) or as the hand-picked GetSummary dictionary;
# actions cross as typed method calls.

@onready var gw: Node = $EngineGateway


func _ready() -> void:
	print("encounters: ", gw.ListEncounters())
	print("decks: ", gw.ListDecks())

	if not gw.StartEncounter("fan_club_president", "", 2026):
		push_error("gateway_demo: boot failed")
		return
	print("boot: ", gw.GetSummary())

	# Play one full round with the same blind policy as the engine tests:
	# leftmost card while affordable, resolve pending blocks, end turn,
	# keep nothing at Back-of-Mind, advance the NPC to completion.
	var safety := 0
	while true:
		var s: Dictionary = gw.GetSummary()
		if s["phase"] != "PlayerPending" or s["playerPriority"] < 1 or s["handSize"] == 0:
			break
		safety += 1
		if safety > 50:
			push_error("gateway_demo: runaway player loop")
			return
		if not gw.PlayCardAt(0):
			break  # leftmost card is illegal to play right now — stop, like the tests do
		_resolve_pending_blocks()

	gw.DoEndTurn()
	if gw.GetSummary()["phase"] == "BotMSelect":
		gw.DoBotmSelect([])
	while gw.GetSummary()["phase"] == "EnemyPending":
		safety += 1
		if safety > 100:
			push_error("gateway_demo: runaway npc loop")
			return
		gw.DoAdvance()
		_resolve_pending_blocks()

	print("after round 1: ", gw.GetSummary())

	# Full state is readable from GDScript as a Dictionary.
	var state: Dictionary = gw.GetState()
	print("full state keys: ", state.keys())
	print("player priority via full state: ", state["player"]["priority"])


func _resolve_pending_blocks() -> void:
	while gw.HasPendingBlock():
		var info: Dictionary = gw.PendingBlockInfo()
		if info.get("type", "") == "chooseNumber":
			gw.DoChooseNumber(info["min"])
		else:
			gw.DoAcknowledge()
