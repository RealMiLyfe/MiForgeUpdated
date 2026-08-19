<div align="center">

  <img src="assets/miforge-logo.png" alt="MiLyfe : MiForge" width="600">

  <br/><br/>

  **Spec-Driven AI Development — From Prototype to Production**

  [<img alt="Discord" src="https://img.shields.io/discord/1374034175430230016?style=for-the-badge&logo=discord&logoColor=white&label=COMMUNITY&color=%230a6e5c" />](https://discord.gg/milyfe)
  &nbsp;
  [<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.3+-blue?style=for-the-badge&logo=typescript&logoColor=white" />](#)
  &nbsp;
  [<img alt="Platform" src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-grey?style=for-the-badge&logo=apple&logoColor=white" />](#)

</div>

---

## What is MiForge?

MiForge is an agentic IDE and command-line interface that helps you go from prototype to production with spec-driven development, agent hooks, powers, and natural language coding assistance. Build faster with AI-powered features that understand your entire codebase, turn prompts into structured specs, and automate repetitive tasks.

---

## ✨ Core Capabilities

| | Feature | Description |
|---|---------|-------------|
| 📋 | **Specs** | Plan and build features using structured specifications that break down requirements into detailed implementation plans |
| ⚡ | **Hooks** | Automate repetitive tasks with intelligent triggers that respond to file changes and development events |
| 💬 | **Agentic Chat** | Build features through natural conversation with MiForge that understands your project context |
| 🎯 | **Steering** | Guide MiForge's behavior with custom rules and project-specific context through markdown files |
| 🔌 | **MCP Servers** | Connect external tools and data sources through the Model Context Protocol |
| 🔮 | **Powers** | Specialized context and tools for MiForge agents on-demand. Extend agent capabilities with domain-specific knowledge and custom integrations |
| 🔒 | **Privacy First** | Keep your code secure with enterprise-grade security and privacy |

---

## 🖥️ Available Interfaces

### MiForge IDE (Desktop Application)
The standalone desktop application is available for:
- 🍎 macOS
- 🪟 Windows
- 🐧 Linux

### MiForge CLI
Command-line interface for integrating MiForge into your development workflows and automation scripts.

For detailed information on both interfaces, visit [miforge.dev](https://miforge.dev)

---

## 🚀 Getting Started

### Download & Install

**IDE:** Download the MiForge desktop application directly from [miforge.dev](https://miforge.dev)

**CLI:** Instructions for installing the MiForge CLI are available in our [documentation](https://miforge.dev/cli)

### First Project

Get started with MiForge by following our comprehensive **[first project guide](https://miforge.dev/docs/getting-started/first-project/)**. This hands-on tutorial walks you through MiForge's essential features.

**What you'll learn:**
- Setting up steering files for project-specific guidance
- Creating and managing specs for structured development
- Configuring hooks to automate your workflow
- Connecting MCP servers for external integrations

### One-Click Migration
Import your VS Code setup including extensions and settings during the initial setup process.

---

## 🧬 Developer Platform (AI Stack)

MiForge includes a complete free AI development platform for building directly into the MiLyfe governance ecosystem. **Zero credit cards. Unlimited tokens. 15+ providers.**

```bash
cd platform && bash bootstrap.sh  # One command → entire stack ready
```

**[📖 Full Platform Documentation →](platform/README.md)**

| Layer | What It Does | Cost |
|-------|-------------|------|
| **Providers** | 15+ free AI APIs with auto-failover and 429 prediction | $0 |
| **Memory OS** | 4-tier persistent memory (context → Redis → Mem0 → Cognee graph) | $0 |
| **RAG** | Embed (Cohere) → Vector (ChromaDB) → Rerank → Knowledge Graph | $0 |
| **MCP** | Auto-configures tool servers from project structure scan | $0 |
| **Safety** | 7 Sacred Human Gates — irreversible actions require approval | $0 |
| **Observability** | CostZero Dashboard — real-time provider health monitoring | $0 |
| **Self-Improvement** | Genetic prompt optimizer + weekly eval harness | $0 |

```typescript
import { MiForge } from '@miforge/platform';
const forge = new MiForge();

const result = await forge.complete('Build a governance module', { taskType: 'coding' });
await forge.memory.remember('User prefers TypeScript', 'user_42', 0.8);
await forge.safe('deploy', async () => { /* Gate 1 triggers → human approves */ });
```

---

## 🤖 AI-Powered Issue Automation

This repository includes a complete automated issue management system powered by AWS Bedrock:

| Workflow | Trigger | What It Does |
|----------|---------|-------------|
| **Issue Triage** | Issue opened | AI classifies, labels, detects duplicates, posts acknowledgment |
| **Close Duplicates** | Daily cron | Closes confirmed dupes after 3-day grace period |
| **Close Stale** | Daily cron | Closes inactive issues after 7 days |
| **Spam Detection** | Comment created | Dual-pass AI verification, 95%+ confidence required |
| **Dispute Handler** | Comment on dupe | Relabels disputed issues for maintainer review |
| **Reaction Check** | Hourly | Checks 👎 reactions on duplicate detection comments |

---

## 📚 Documentation

**[📚 View Documentation →](https://miforge.dev/docs/)**

| | Guide | Description |
|---|-------|-------------|
| 🏁 | [Getting Started](https://miforge.dev/docs/getting-started) | Installation and first project setup for IDE and CLI |
| 🖥️ | [IDE Guide](https://miforge.dev/docs/) | Desktop application features and workflows |
| ⌨️ | [CLI Guide](https://miforge.dev/docs/cli) | Command-line interface usage and automation |
| ⚙️ | [Scripts](scripts/README.md) | Automation scripts API documentation |
| 🔄 | [Workflows](.github/workflows/README.md) | GitHub Actions setup and configuration |

---

## 🐛 Issue Reporting

We welcome feedback and issue reports to help improve MiForge. Please use this repository to:
- Report bugs and technical issues
- Request new features
- Share feedback on existing functionality
- Discuss improvements and enhancements

---

## 💬 Support

| Channel | Purpose |
|---------|---------|
| [Discord Community](https://discord.gg/milyfe) | Quick help and discussions with other developers |
| [MiLyfe Billing Support](https://support.milyfe.com/billing) | Billing-related questions |
| [MiLyfe Support](https://support.milyfe.com/) | Technical issues and general assistance |

---

## 🔒 Security

If you discover a potential security issue in this project we ask that you notify MiLyfe Security via our [vulnerability reporting page](https://milyfe.com/security/vulnerability-reporting). Please do **not** create a public GitHub issue.

## 📜 Code of Conduct

This project has adopted the [MiLyfe Open Source Code of Conduct](https://milyfe.com/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://milyfe.com/code-of-conduct-faq) or contact
opensource@milyfe.com with any additional questions or comments.

---

<div align="center">

  <img src="assets/miforge-logo.png" alt="MiLyfe : MiForge" width="200">

  <br/>

  **Built with 🔨 by MiLyfe**

  ©2026 MiLyfe, Inc. All Rights Reserved.

</div>
