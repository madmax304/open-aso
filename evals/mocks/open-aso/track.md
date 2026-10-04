---
type: fixed
expect:
  action: [add, remove, list]
---
{
  "action": "{{input.action}}",
  "result": "Tracking list updated. Tracked keywords and apps are checked by the daily run (open-aso track run).",
  "notes": ["Tracking is free. Run the rankings tool (or `open-aso track run` on a schedule) to record positions."],
  "cost_usd": 0,
  "cached": false,
  "spend_today_usd": 0
}
