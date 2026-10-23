"""Tiny YAML subset reader (key: value / nested 2-space maps) so training has no PyYAML dependency."""
def load(path):
    root, stack = {}, [(-1, None)]
    cur = root; stack = [(-1, root)]
    for raw in open(path, encoding="utf-8"):
        if not raw.strip() or raw.lstrip().startswith("#"): continue
        indent = len(raw) - len(raw.lstrip()); line = raw.strip()
        while stack and indent <= stack[-1][0]: stack.pop()
        parent = stack[-1][1]
        if ":" not in line: continue
        k, _, v = line.partition(":"); v = v.strip(); k = k.strip()
        if v == "":
            parent[k] = {}; stack.append((indent, parent[k]))
        else:
            v = v.strip('"').strip("'")
            if v.lower() in ("true", "false"): v = v.lower() == "true"
            else:
                try: v = int(v)
                except ValueError:
                    try: v = float(v)
                    except ValueError: pass
            parent[k] = v
    return root
