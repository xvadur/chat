import os
import re

def generate_html():
    dashboard_path = "/Users/_xvadur/.openclaw/workspace/control/GLOBAL-DASHBOARD.md"
    output_path = "/Users/_xvadur/.openclaw/workspace/control/DASHBOARD.html"
    
    if not os.path.exists(dashboard_path):
        return "Dashboard source not found."

    with open(dashboard_path, 'r') as f:
        content = f.read()

    # Convert Markdown to simple HTML sections
    content_html = content.replace("# ", "<h1>").replace("## ", "<h2>")
    
    # Simple table conversion for Linear projects
    content_html = re.sub(r'\|(.*?)\|', r'<tr><td>\1</td></tr>', content_html)
    
    html_template = f"""
    <!DOCTYPE html>
    <html lang="sk">
    <head>
        <meta charset="UTF-8">
        <title>XVADUR COMMAND CENTER</title>
        <style>
            body {{ background: #0a0a0a; color: #00ff41; font-family: 'Courier New', Courier, monospace; padding: 40px; line-height: 1.6; }}
            .container {{ max-width: 900px; margin: auto; border: 1px solid #00ff41; padding: 20px; box-shadow: 0 0 20px #00ff4133; }}
            h1 {{ color: #fff; border-bottom: 2px solid #00ff41; padding-bottom: 10px; text-transform: uppercase; letter-spacing: 3px; }}
            h2 {{ color: #00ff41; margin-top: 30px; text-transform: uppercase; font-size: 1.2em; text-decoration: underline; }}
            table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
            td, th {{ border: 1px solid #333; padding: 8px; text-align: left; }}
            tr:nth-child(even) {{ background: #111; }}
            .status-critical {{ color: #ff3e3e; font-weight: bold; }}
            .status-active {{ color: #00ff41; }}
            .xp-bar {{ border: 1px solid #00ff41; height: 20px; margin: 10px 0; position: relative; }}
            .xp-fill {{ background: #00ff41; height: 100%; width: 92%; }} /* Hardcoded 690/750 approx */
            .pulse {{ animation: blink 2s infinite; }}
            @keyframes blink {{ 0% {{ opacity: 1; }} 50% {{ opacity: 0.3; }} 100% {{ opacity: 1; }} }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="pulse" style="float: right;">● SYSTEM ONLINE</div>
            {content_html.replace('CRITICAL', '<span class="status-critical">CRITICAL</span>')}
        </div>
        <script>
            setTimeout(() => location.reload(), 600000); // Reload every 10 mins
        </script>
    </body>
    </html>
    """
    
    with open(output_path, 'w') as f:
        f.write(html_template)
    
    return f"Dashboard generated at {output_path}"

if __name__ == "__main__":
    print(generate_html())
