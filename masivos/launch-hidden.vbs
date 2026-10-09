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

' Configuración local (dirección del sistema y token para pedidos y turnos).
Dim envFile, envStream, linea, pos
envFile = root & "\local.env"
If files.FileExists(envFile) Then
  Set envStream = files.OpenTextFile(envFile, 1)
  Do While Not envStream.AtEndOfStream
    linea = Trim(envStream.ReadLine)
    pos = InStr(linea, "=")
    If pos > 1 And Left(linea, 1) <> "#" Then
      shell.Environment("Process")(Trim(Left(linea, pos - 1))) = Trim(Mid(linea, pos + 1))
    End If
  Loop
  envStream.Close
End If

ready = PanelReady()
If Not ready Then
  shell.CurrentDirectory = root
  shell.Run Chr(34) & node & Chr(34) & " " & Chr(34) & server & Chr(34), 0, False
  For i = 1 To 40
    WScript.Sleep 500
    If PanelReady() Then Exit For
  Next
End If

' Con /inicio (arranque de Windows) sólo levanta el panel, sin abrir el navegador.
If Not (WScript.Arguments.Count > 0 And LCase(WScript.Arguments(0)) = "/inicio") Then
  shell.Run url, 1, False
End If
