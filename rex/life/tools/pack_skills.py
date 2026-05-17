#!/usr/bin/env python3
"""
pack_skills.py — 把 rex/life/SKILL*.md 打包成 Cowork user skills (.skill 檔)

用途:
  每次 SKILL_TWLIFE.md / SKILL_SKL.md / SKILL.md 內容有改,跑一次這個,
  產出 3 個 .skill 檔到 dist/,然後在 Cowork 點 "Save skill" 安裝。

執行:
  cd rex/life
  python3 tools/pack_skills.py
  # 或從任何位置:
  python3 path/to/rex/life/tools/pack_skills.py

產出位置:
  rex/life/dist/*.skill  (gitignore 掉)
"""
import shutil
import subprocess
import sys
from pathlib import Path

# 三個 source SKILL → 對應的 skill name (一定要跟 frontmatter `name:` 一樣)
MAPPING = {
    "SKILL.md":         "life-product-onboard",
    "SKILL_SKL.md":     "skl-life-product",
    "SKILL_TWLIFE.md":  "twlife-life-product",
}

# package_skill.py 在 skill-creator plugin 裡(Cowork 自帶,Windows 路徑會自動 resolve)
def find_package_skill_script():
    """找 skill-creator/scripts/package_skill.py"""
    candidates = []
    import os
    appdata = os.environ.get("APPDATA", "")
    if appdata:
        # Windows Cowork 預設位置
        candidates.append(Path(appdata) / "Claude" / "local-agent-mode-sessions")
    # Linux/Mac/Cowork sandbox
    candidates.append(Path.home() / ".claude" / "skills")
    candidates.append(Path("/sessions/gallant-kind-faraday/mnt/.claude/skills"))

    for root in candidates:
        if not root.exists():
            continue
        for hit in root.rglob("skill-creator/scripts/package_skill.py"):
            return hit
    return None


def main():
    life_dir = Path(__file__).resolve().parent.parent  # rex/life/
    dist = life_dir / "dist"
    dist.mkdir(exist_ok=True)

    # 1. 把每個 SKILL 複製到 dist/<name>/SKILL.md
    print(f"打包 {len(MAPPING)} 個 skill → {dist}/")
    for src_name, skill_name in MAPPING.items():
        src = life_dir / src_name
        if not src.exists():
            print(f"  ✗ {src_name} 不存在,跳過")
            continue
        folder = dist / skill_name
        if folder.exists():
            shutil.rmtree(folder)
        folder.mkdir()
        shutil.copy(src, folder / "SKILL.md")
        print(f"  ✓ {src_name} → {skill_name}/SKILL.md")

    # 2. 跑 package_skill.py 為每個產生 .skill 檔
    pkg = find_package_skill_script()
    if not pkg:
        print("\n❌ 找不到 skill-creator/scripts/package_skill.py")
        print("   要確保 Cowork 已安裝 anthropic-skills:skill-creator")
        sys.exit(1)

    print(f"\n用 {pkg} 打包...")
    skill_creator_dir = pkg.parent.parent  # .../skill-creator/

    ok = 0
    for skill_name in MAPPING.values():
        folder = dist / skill_name
        if not folder.exists():
            continue
        result = subprocess.run(
            [sys.executable, "-m", "scripts.package_skill", str(folder), str(dist)],
            cwd=skill_creator_dir,
            capture_output=True, text=True,
        )
        if "✅ Successfully" in result.stdout:
            ok += 1
            print(f"  ✓ {skill_name}.skill")
        else:
            print(f"  ✗ {skill_name} 失敗:")
            print(result.stdout[-300:])
            print(result.stderr[-300:])

    print(f"\n完成:{ok}/{len(MAPPING)} 個 .skill 檔在 {dist}/")
    print("下一步:在 Cowork 把 .skill 檔拖進來,或用 present_files 顯示卡片後點 Save skill。")


if __name__ == "__main__":
    main()
