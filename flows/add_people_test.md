---
mode: testing
url: http://localhost:4173/
tags: [smoke, people]
max_steps: 15
---

# Splitly: add people to a group

<!-- kane-loop covers: demo-app/public/app.js demo-app/public/index.html demo-app/public/style.css demo-app/server.js -->

## Add three people
Type "Ana" into the Name field and click "Add person". Then add "Ben" the same way, then "Chen".
Verify the page shows "3 people" and the people list contains Ana, Ben and Chen.
