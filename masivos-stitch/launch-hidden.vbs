Option Explicit

Dim shell, files, root, node, server, url, http, i, ready
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
server = root & "\server.js"
url = "http://127.0.0.1:3867"
node = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
If Not files.FileExists(node) Then node = "node.exe"

Function PanelReady()
  On Error Resume Next
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  http.Open "GET", url & "/api/status", False
  http.Send
  PanelReady = (Err.Number = 0 And http.Status = 200)
  Err.Clear
  On Error GoTo 0
End Function

ready = PanelReady()
If Not ready Then
  shell.CurrentDirectory = root
  shell.Run Chr(34) & node & Chr(34) & " " & Chr(34) & server & Chr(34), 0, False
  For i = 1 To 40
    WScript.Sleep 500
    If PanelReady() Then Exit For
  Next
End If

shell.Run url, 1, False
