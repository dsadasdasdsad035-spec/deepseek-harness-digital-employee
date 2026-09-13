## 1. 数据与远程面

- [x] 1.1 `packages/core/company`：`CompanyRecord` 增加可选 `skinId`（wire 类型同步），导出 `DEFAULT_COMPANY_SKIN_ID = 'modern'`
- [x] 1.2 `packages/core/company-file`：解析/写回 `skinId`（缺省不报错，往返保持）；单测覆盖 旧记录无字段回退默认 与 切换后落盘
- [x] 1.3 `packages/host/company-management`：`update` 接受 `skinId` 透传存储；列表/详情/`companyFloor` 载荷携带；重建 typert 工件并挂同步 spec 断言
- [x] 1.4 组装快照扩展：无皮肤创建 → 默认 id；`update({ skinId: 'courtyard' })` → 楼层载荷携带新值；重放全绿

## 2. 皮肤目录与场景参数化

- [x] 2.1 `ui-companies` 新增 `skins.ts`：`CompanySkin` 描述符 + 五套预设（modern 默认/courtyard/neon/cottage/glass，含园区与办公两层参数与选择器预览色板）+ 未知 id 回退默认的解析函数
- [x] 2.2 `scene.ts` 参数化：`buildHouse(company, skin)`（房身/屋顶形制/配色/天空地面/装饰物：树/灯笼/霓虹描边/烟囱），分类色在皮肤调色板内保留语义
- [x] 2.3 `scene.ts` 参数化内部：`buildDepartmentZone(dept, skin)`（地面/地毯/桌型/屏幕发光/环境光），宣传图广告牌与路牌在所有皮肤下保留
- [x] 2.4 园区层支持多公司异皮肤同屏渲染（每房子取各自 skinId）

## 3. 皮肤选择器与热换

- [x] 3.1 公司面板新增皮肤选择器：预设卡（色板预览 + 默认标记），点选经 `update` 持久化
- [x] 3.2 选中后热换：仅重建当前层（复用 `setCampus`/`setFloor`），不重载页面；未知皮肤回退默认呈现
- [x] 3.3 新建公司默认皮肤路径验证（创建流程无皮肤输入即为默认）

## 4. 「组织」下拉菜单

- [x] 4.1 `ui-companies` 侧栏入口改造为「组织」下拉：点击弹菜单（外点捕获关闭），项：「公司」开控制台、「数字员工」`close() + layout.openApplication()`
- [x] 4.2 `ui-digital-employees` 移除独立 footer 注册（工作区本体、设置行、composer source 不动）；检查并更新引用旧按钮文案的快照/测试
- [x] 4.3 实机验证：登录 → 「组织」下拉两入口可用 → 公司皮肤选择与热换 → 园区多公司异皮肤同屏

## 5. 门禁与文档

- [x] 5.1 受影响测试与门禁：typecheck/lint/hygiene/doc-sync 全绿；组装快照重放
- [x] 5.2 文档同步：两包 README（皮肤字段与菜单变更）、Agent Note 落稿、目录再生成（如 config/event 面有变动）
