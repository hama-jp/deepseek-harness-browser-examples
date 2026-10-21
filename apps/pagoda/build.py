from pathlib import Path
r=Path(__file__).resolve().parent
s=(r/"src/template.html").read_text()
s=s.replace("/*__THREE__*/",(r/"vendor/three.min.js").read_text()).replace("/*__APP__*/",(r/"src/main.js").read_text())
(r/"index.html").write_text(s)
