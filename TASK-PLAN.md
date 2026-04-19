# MS+SS+CA Phase 1-3 代码补充计划

## 当前状态分析

### 已存在但需验证的代码
- ✅ Monorepo结构 (pnpm + turbo)
- ✅ Prisma schema (11表)
- ✅ MS API基础路由
- ✅ CA Bot基础功能
- ✅ 前端Campaign创建向导
- ✅ 智能合约MSCampaignVault.sol

### 发现的问题
1. **类型定义问题**: packages/types/src/index.ts 路径错误
2. **命名冲突**: CampaignPayment接口重命名为CampaignPaymentData
3. **缺少CA路由**: API缺少/ca/v1/*路由
4. **缺少SS模块**: Shilling Skill执行逻辑不完整
5. **合约配置**: Hardhat配置和部署脚本缺失
6. **测试覆盖**: 缺少单元测试和集成测试

---

## Phase 1: 基础设施补充

### 1.1 修复类型定义
- [ ] 修复packages/types/src/index.ts导出路径
- [ ] 统一CampaignPayment命名
- [ ] 添加缺失的类型定义

### 1.2 完善数据库层
- [ ] 添加Prisma seed脚本
- [ ] 完善@ms/database导出
- [ ] 添加数据库工具函数

### 1.3 完善工具包
- [ ] 完成@ms/utils定价逻辑
- [ ] 添加通用工具函数

---

## Phase 2: 核心功能补充

### 2.1 MS API补充
- [ ] 添加CA路由 (/ca/v1/offers, /ca/v1/executions)
- [ ] 完善Campaign状态流转
- [ ] 添加SS执行端点

### 2.2 SS (Shilling Skill)模块
- [ ] 创建SS执行引擎
- [ ] 添加任务验证逻辑
- [ ] 集成CA Bot

### 2.3 CA Bot补充
- [ ] 完善任务执行处理器
- [ ] 添加报告生成功能
- [ ] 完善与MS API的集成

### 2.4 前端补充
- [ ] 添加真实API调用
- [ ] 完善钱包支付流程
- [ ] 添加Dashboard数据展示

---

## Phase 3: 区块链集成补充

### 3.1 Hardhat配置
- [ ] 完善hardhat.config.ts
- [ ] 添加网络配置
- [ ] 添加验证配置

### 3.2 部署脚本
- [ ] 创建部署脚本
- [ ] 添加测试网部署
- [ ] 创建合约交互工具

### 3.3 前端合约集成
- [ ] 添加wagmi合约配置
- [ ] 创建支付流程
- [ ] 添加状态监听

---

## Phase 4: 测试与优化 (下一步)

待Phase 1-3完成后开始

---

## 执行顺序

1. 先修复类型和命名问题（阻塞性问题）
2. 补充CA路由和SS模块
3. 完善合约配置和部署
4. 前端集成合约支付
5. 提交所有修改
6. 进入Phase 4测试
