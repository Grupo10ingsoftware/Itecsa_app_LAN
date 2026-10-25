import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { relative,isAbsolute,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Refuse credentials in the repository or a broadly readable Windows directory.
export function assertPrivateOperatorDirectory(supplied) {
  assert.equal(process.platform,'win32','This operator credential procedure requires Windows ACLs');
  const directory=realpathSync(supplied),root=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
  const child=relative(root,directory);
  assert.ok(child&&(child==='..'||child.startsWith('..'+sep)||isAbsolute(child)),'Credentials must stay outside the repository');
  const literal=directory.replaceAll("'","''");
  const program=`$ErrorActionPreference='Stop'
$taskPath='${literal}'
$taskAcl=Get-Acl -LiteralPath $taskPath
$taskUser=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$otherAllows=@($taskAcl.Access | Where-Object {$_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -ne $taskUser})
@{ownerMatches=($taskAcl.Owner -eq $taskUser);protected=$taskAcl.AreAccessRulesProtected;otherAllows=$otherAllows.Count}|ConvertTo-Json -Compress
`;
  const result=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','-'],
    {input:program,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim());
  assert.ok(result.ownerMatches&&result.protected&&result.otherAllows===0,'Operator-only protected ACL required before writing credentials');
  return directory;
}
