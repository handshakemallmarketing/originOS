import { checkDataIntegrity, createOperationalBackup, restoreOperationalBackup } from "./index.js";

const [command, first, second] = process.argv.slice(2);
try {
  if (command === "check" && first) {
    const report = await checkDataIntegrity(first); console.log(JSON.stringify(report)); if (!report.ok) process.exitCode = 2;
  } else if (command === "backup" && first && second) {
    const bundle = await createOperationalBackup(first, second); console.log(JSON.stringify({ ok: true, backupPath: second, createdAt: bundle.createdAt, files: bundle.files.map((file) => ({ name: file.name, bytes: file.bytes, sha256: file.sha256 })) }));
  } else if (command === "restore" && first && second) {
    const result = await restoreOperationalBackup(first, second); console.log(JSON.stringify({ ok: true, dataDirectory: second, ...result }));
  } else {
    throw new Error("Usage: operations check DATA_DIR | backup DATA_DIR BACKUP_PATH | restore BACKUP_PATH DATA_DIR");
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "operation failed" })); process.exitCode = 1;
}
