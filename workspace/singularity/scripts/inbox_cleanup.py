#!/usr/bin/env python3
"""Analyze and categorize documents from +/ into LYT structure."""
from pathlib import Path
import re
import shutil
from datetime import datetime

ROOT = Path('/Users/_xvadur/Desktop/xvadur_obsidian_januar')
INBOX = ROOT / '+'
TARGETS = {
    'dots': ROOT / 'Atlas' / 'Dots',
    'sources': ROOT / 'Atlas' / 'Sources', 
    'statements': ROOT / 'Atlas' / 'Statements',
    'things': ROOT / 'Atlas' / 'Things',
    'maps': ROOT / 'Atlas' / 'Maps',
    'calendar': ROOT / 'Calendar' / 'Notes',
}

for t in TARGETS.values():
    t.mkdir(parents=True, exist_ok=True)

def has_date_header(text: str) -> bool:
    """Check if document starts with a date pattern."""
    date_patterns = [
        r'^\d{1,2}\.\d{1,2}\.\d{2,4}',  # 6.2.2026 or 20.2.2026
        r'^\d{4}-\d{2}-\d{2}',           # 2026-02-20
        r'^(Pondelok|Utorok|Streda|Štvrtok|Piatok|Sobota|Nedeľa)',  # Days
        r'^(Január|Február|Marec|Apríl|Máj|Jún|Júl|August|September|Október|November|December)',
    ]
    first_lines = '\n'.join(text[:500].split('\n')[:5])
    for pattern in date_patterns:
        if re.search(pattern, first_lines, re.IGNORECASE):
            return True
    return False

def categorize_file(filepath: Path) -> tuple[str, dict]:
    """Analyze file and return category + metadata."""
    try:
        text = filepath.read_text(encoding='utf-8')
    except Exception as e:
        return ('dots', {'error': str(e)})
    
    name = filepath.stem.lower()
    metadata = {
        'title': filepath.stem,
        'word_count': len(text.split()),
        'has_frontmatter': text.startswith('---'),
    }
    
    # Check for date header -> Calendar
    if has_date_header(text):
        return ('calendar', metadata)
    
    # Categorize by filename patterns
    if any(x in name for x in ['architektúra', 'architecture', 'struktúra', 'map', 'systém']):
        return ('maps', metadata)
    
    if any(x in name for x in ['interview', 'rozhovor', 'validácia', 'stretnutie', 'štefan']):
        return ('sources', metadata)
    
    if any(x in name for x in ['proje', 'finan', 'recepcia', 'aistryko', 'content']):
        return ('things', metadata)
    
    if any(x in name for x in ['heavy', 'crown', 'identity', 'statements', 'vision']):
        return ('statements', metadata)
    
    # Daily logs with dates in filename
    if re.match(r'^\d{1,2}\.\d{1,2}', name) or re.match(r'^\d{4}-\d{2}', name):
        return ('calendar', metadata)
    
    # Default to dots (ideas, thoughts)
    return ('dots', metadata)

def enhance_frontmatter(filepath: Path, category: str) -> str:
    """Add or enhance frontmatter with proper metadata."""
    try:
        text = filepath.read_text(encoding='utf-8')
    except Exception:
        # If file is locked, skip enhancement
        return None
    
    # Parse existing frontmatter
    existing = {}
    if text.startswith('---'):
        end = text.find('---', 3)
        if end != -1:
            fm_text = text[3:end].strip()
            for line in fm_text.split('\n'):
                if ':' in line:
                    k, v = line.split(':', 1)
                    existing[k.strip()] = v.strip()
            text = text[end+3:].strip()
    
    # Build new frontmatter
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    new_fm = {
        'title': existing.get('title', filepath.stem),
        'created': existing.get('created', now),
        'type': category,
        'status': existing.get('status', 'active'),
        'source': 'inbox_cleanup',
    }
    
    # Add category-specific fields
    if category == 'calendar':
        new_fm['type'] = 'daily'
    elif category == 'maps':
        new_fm['type'] = 'map'
    elif category == 'sources':
        new_fm['type'] = 'source'
    elif category == 'statements':
        new_fm['type'] = 'statement'
    elif category == 'things':
        new_fm['type'] = 'thing'
    else:
        new_fm['type'] = 'dot'
    
    # Build YAML
    yaml_lines = ['---']
    for k, v in new_fm.items():
        yaml_lines.append(f'{k}: "{v}"')
    yaml_lines.append('---')
    yaml_lines.append('')
    
    return '\n'.join(yaml_lines) + text

def main():
    results = {k: [] for k in TARGETS.keys()}
    
    for md_file in sorted(INBOX.glob('*.md')):
        try:
            category, metadata = categorize_file(md_file)
            
            # Enhance content
            new_content = enhance_frontmatter(md_file, category)
            if new_content is None:
                print(f"⚠️  Skipping (locked): {md_file.name}")
                continue
            
            # Move to target
            target_path = TARGETS[category] / md_file.name
            
            # Write enhanced content
            target_path.write_text(new_content, encoding='utf-8')
            
            # Remove from inbox
            md_file.unlink()
            
            results[category].append({
                'name': md_file.name,
                'words': metadata.get('word_count', 0),
            })
        except Exception as e:
            print(f"❌ Error processing {md_file.name}: {e}")
    
    # Print summary
    print("✅ INBOX CLEANUP COMPLETE\n")
    for category, files in results.items():
        if files:
            print(f"📁 {category.upper()}: {len(files)} files")
            for f in files:
                print(f"   - {f['name']} ({f['words']} words)")
    
    print(f"\n📊 Total processed: {sum(len(v) for v in results.values())} files")

if __name__ == '__main__':
    main()
