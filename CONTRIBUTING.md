# 👥 Team Workflow & Contribution Guidelines

## 🌟 Project Leadership
- **Project Owner:** Pranay Shastri ([@pranayshastri](https://github.com/pranayshastri))
- **Team Leader:** Ankit Prajapati ([@Ankitprajapati24](https://github.com/Ankitprajapati24))

---

## 🔒 Branch Protection Policy

The `main` branch is **strictly protected**:
1. **Direct pushes to `main` are restricted.** Only Project Owner **Pranay Shastri** and Team Leader **Ankit Prajapati** have merge/push authority to `main`.
2. **Pull Requests Required:** All other collaborators and interns must submit their work via Pull Requests.
3. **Approval Required:** Merging into `main` requires an approving review from **Pranay Shastri (`@pranayshastri`)** or **Ankit Prajapati (`@Ankitprajapati24`)** as designated in `.github/CODEOWNERS`.

---

## 🌿 Intern Branching Workflow

All collaborators and interns must follow this standard Git feature-branching workflow:

### 1. Synchronize with `main`
Always start your work from the latest version of `main`:
```bash
git checkout main
git pull origin main
```

### 2. Create a Feature Branch
Create a descriptive branch for your task:
```bash
# For a new feature:
git checkout -b feat/<service-or-feature-name>

# Examples:
git checkout -b feat/auth-service-login
git checkout -b feat/order-outbox-pattern
git checkout -b feat/inventory-idempotent-consumer
git checkout -b feat/frontend-catalog-ui

# For a bug fix:
git checkout -b fix/<bug-description>
```

### 3. Implement and Commit Changes
Make clean, focused commits with clear messages:
```bash
git add .
git commit -m "feat(order-service): implement outbox poller worker logic"
```

### 4. Push Your Branch to GitHub
```bash
git push -u origin feat/<your-branch-name>
```

### 5. Open a Pull Request (PR)
1. Go to the repository on GitHub: [https://github.com/pranayshastri/interns-mini-project](https://github.com/pranayshastri/interns-mini-project)
2. Click **Compare & pull request**.
3. Set the base branch to `main` and your branch as the compare branch.
4. Add a clear description of the task completed and test results.
5. Request review from **Ankit Prajapati (`@Ankitprajapati24`)** or **Pranay Shastri (`@pranayshastri`)**.

### 6. Review & Merge
- Address any comments or feedback during code review.
- Once approved by Team Lead Ankit Prajapati or Project Owner Pranay Shastri, the PR will be merged into `main`.
