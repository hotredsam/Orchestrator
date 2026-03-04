Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\hotre\OneDrive\Desktop\Coding Projects\swarm-town"
WshShell.Run "pythonw orchestrator.py --server-only", 0, False
