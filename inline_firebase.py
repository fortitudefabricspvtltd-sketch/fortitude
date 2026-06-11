import os
import re

base_dir = "/Users/saiyatin/Downloads/github_ready"

firebase_init = """import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
const app = initializeApp({
  apiKey: "AIzaSyA5OU2JZdmTpjDXJILxPQ-Ypuum0Wkhk3M",
  authDomain: "fortitude-b0a25.firebaseapp.com",
  projectId: "fortitude-b0a25",
  storageBucket: "fortitude-b0a25.firebasestorage.app",
  messagingSenderId: "506151176055",
  appId: "1:506151176055:web:81a95ce6f7094f4bb8c372"
});
"""

files_to_update = {
    "admin.html": {
        "old": [
            "import { app, db, auth } from './firebase-config.js';",
            "import { onAuthStateChanged, signOut } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js\";",
            "import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, orderBy } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js\";"
        ],
        "new": [
            "import { initializeApp } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js\";",
            "import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, orderBy } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js\";",
            "import { getAuth, onAuthStateChanged, signOut } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js\";\n",
            "const app = initializeApp({",
            "  apiKey: \"AIzaSyA5OU2JZdmTpjDXJILxPQ-Ypuum0Wkhk3M\",",
            "  authDomain: \"fortitude-b0a25.firebaseapp.com\",",
            "  projectId: \"fortitude-b0a25\",",
            "  storageBucket: \"fortitude-b0a25.firebasestorage.app\",",
            "  messagingSenderId: \"506151176055\",",
            "  appId: \"1:506151176055:web:81a95ce6f7094f4bb8c372\"",
            "});",
            "const db = getFirestore(app);",
            "const auth = getAuth(app);"
        ]
    },
    "admin_login.html": {
        "old": [
            "import { auth } from './firebase-config.js';",
            "import { signInWithEmailAndPassword, onAuthStateChanged } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js\";"
        ],
        "new": [
            "import { initializeApp } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js\";",
            "import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js\";\n",
            "const app = initializeApp({",
            "  apiKey: \"AIzaSyA5OU2JZdmTpjDXJILxPQ-Ypuum0Wkhk3M\",",
            "  authDomain: \"fortitude-b0a25.firebaseapp.com\",",
            "  projectId: \"fortitude-b0a25\",",
            "  storageBucket: \"fortitude-b0a25.firebasestorage.app\",",
            "  messagingSenderId: \"506151176055\",",
            "  appId: \"1:506151176055:web:81a95ce6f7094f4bb8c372\"",
            "});",
            "const auth = getAuth(app);"
        ]
    },
    "contact_us.html": {
        "old": [
            "import { db } from './firebase-config.js';",
            "import { collection, addDoc } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js\";"
        ],
        "new": [
            "import { initializeApp } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js\";",
            "import { getFirestore, collection, addDoc } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js\";\n",
            "const app = initializeApp({",
            "  apiKey: \"AIzaSyA5OU2JZdmTpjDXJILxPQ-Ypuum0Wkhk3M\",",
            "  authDomain: \"fortitude-b0a25.firebaseapp.com\",",
            "  projectId: \"fortitude-b0a25\",",
            "  storageBucket: \"fortitude-b0a25.firebasestorage.app\",",
            "  messagingSenderId: \"506151176055\",",
            "  appId: \"1:506151176055:web:81a95ce6f7094f4bb8c372\"",
            "});",
            "const db = getFirestore(app);"
        ]
    },
    "blog.html": {
        "old": [
            "import { db } from './firebase-config.js';",
            "import { collection, getDocs, query, orderBy } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js\";"
        ],
        "new": [
            "import { initializeApp } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js\";",
            "import { getFirestore, collection, getDocs, query, orderBy } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js\";\n",
            "const app = initializeApp({",
            "  apiKey: \"AIzaSyA5OU2JZdmTpjDXJILxPQ-Ypuum0Wkhk3M\",",
            "  authDomain: \"fortitude-b0a25.firebaseapp.com\",",
            "  projectId: \"fortitude-b0a25\",",
            "  storageBucket: \"fortitude-b0a25.firebasestorage.app\",",
            "  messagingSenderId: \"506151176055\",",
            "  appId: \"1:506151176055:web:81a95ce6f7094f4bb8c372\"",
            "});",
            "const db = getFirestore(app);"
        ]
    },
    "blog_post.html": {
        "old": [
            "import { db } from './firebase-config.js';",
            "import { doc, getDoc, collection, getDocs, query, orderBy } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js\";"
        ],
        "new": [
            "import { initializeApp } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js\";",
            "import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy } from \"https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js\";\n",
            "const app = initializeApp({",
            "  apiKey: \"AIzaSyA5OU2JZdmTpjDXJILxPQ-Ypuum0Wkhk3M\",",
            "  authDomain: \"fortitude-b0a25.firebaseapp.com\",",
            "  projectId: \"fortitude-b0a25\",",
            "  storageBucket: \"fortitude-b0a25.firebasestorage.app\",",
            "  messagingSenderId: \"506151176055\",",
            "  appId: \"1:506151176055:web:81a95ce6f7094f4bb8c372\"",
            "});",
            "const db = getFirestore(app);"
        ]
    }
}

for filename, data in files_to_update.items():
    filepath = os.path.join(base_dir, filename)
    if not os.path.exists(filepath):
        print(f"File not found: {filename}")
        continue
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Find where the old imports are
    old_imports_joined = "\\n        ".join(data["old"])
    # Some files might have different indentation
    
    # We will just replace each old line with nothing, and then inject the new block
    # right after `<script type="module">`
    script_tag = '<script type="module">'
    idx = content.find(script_tag)
    if idx == -1:
        print(f"No <script type='module'> found in {filename}")
        continue
    
    # Remove the old lines individually
    for old_line in data["old"]:
        # Strip leading/trailing space in search just in case
        pattern = re.compile(r'^\s*' + re.escape(old_line) + r'\s*$', re.MULTILINE)
        content = pattern.sub('', content)

    # Inject new lines
    new_imports_joined = "\\n        ".join(data["new"])
    content = content.replace(script_tag, script_tag + "\\n        " + new_imports_joined)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    
    print(f"Successfully updated {filename}")

# Also delete firebase-config.js since it's no longer needed
if os.path.exists(os.path.join(base_dir, "firebase-config.js")):
    os.remove(os.path.join(base_dir, "firebase-config.js"))
    print("Deleted firebase-config.js")

