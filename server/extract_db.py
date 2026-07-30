import re
import sys

with open('server/db.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Extraer imports
imports_match = re.search(r'(.+?)\n\nensureStoragePaths', content, re.DOTALL)
imports = imports_match.group(1) if imports_match else ''

# Extraer funciones hasColumn y ensureColumn
funcs_match = re.search(r'(function hasColumn\(.+?function ensureColumn\(.+?\}\n)', content, re.DOTALL)
funcs = funcs_match.group(1) if funcs_match else ''

# Extraer bloques db.exec(`...`)
exec_blocks = re.findall(r"db\.exec\(`\n([\s\S]+?)`\);", content)

# Extraer ensureColumn calls
ensure_calls = re.findall(r"ensureColumn\(.+?\);", content)

# Extraer db.exec individuales (índices sueltos)
loose_execs = re.findall(r"db\.exec\(\s*[`'\"](.+?)[`'\"]\s*\);", content)

# Extraer backfills (try blocks)
backfills = re.findall(r'(try \{\n[\s\S]+?\n\} catch \(e\) \{[\s\S]+?\}\n)', content)

# Extraer seed data (INSERT OR IGNORE, etc.)
seeds = re.findall(r"(INSERT OR IGNORE[\s\S]+?);", content)

print("=== IMPORTS ===")
print(imports[:500])
print("\n=== FUNCS ===")
print(funcs[:500])
print(f"\n=== EXEC BLOCKS: {len(exec_blocks)} ===")
for i, b in enumerate(exec_blocks):
    print(f"Block {i}: {len(b)} chars")
print(f"\n=== ENSURE CALLS: {len(ensure_calls)} ===")
print(f"\n=== LOOSE EXECS: {len(loose_execs)} ===")
print(f"\n=== BACKFILLS: {len(backfills)} ===")
print(f"\n=== SEEDS: {len(seeds)} ===")
