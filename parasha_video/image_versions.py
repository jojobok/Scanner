"""Non-destructive image replacement with versioned backups."""
from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Callable


def replace_scene_image(
    img_dir: Path,
    name: str,
    existing: list[Path],
    source: Path,
    provenance: str,
    generate: Callable[[Path], None],
) -> Path:
    """Generate to staging; archive originals before committing replacement.

    If generation or backup fails, existing images are not removed.
    """
    img_dir.mkdir(parents=True, exist_ok=True)
    version_id = uuid.uuid4().hex
    staging = img_dir / f".{name}.{version_id}.pending.png"
    destination = img_dir / f"{name}.png"
    backup_dir = img_dir / "versions" / name / version_id
    try:
        generate(staging)
        if not staging.is_file() or staging.stat().st_size == 0:
            raise RuntimeError("Image generator produced no usable file")
        if existing or source.exists():
            backup_dir.mkdir(parents=True, exist_ok=False)
            for old in existing:
                shutil.copy2(old, backup_dir / old.name)
            if source.exists():
                shutil.copy2(source, backup_dir / source.name)
        # Commit only after generation and backups have succeeded.
        staging.replace(destination)
        for old in existing:
            if old != destination:
                old.unlink()
        source.write_text(provenance, encoding="utf-8")
        return destination
    finally:
        staging.unlink(missing_ok=True)
