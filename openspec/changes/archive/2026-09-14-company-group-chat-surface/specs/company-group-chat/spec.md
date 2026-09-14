# company-group-chat Delta — company-group-chat-surface

## MODIFIED Requirements

### Requirement: 群聊入口与渲染

群会话 SHALL 与会话聊天共用同一呈现体系：群创建时 SHALL 追加 `company-group/opened`（含公司标识）标记事件，客户端 SHALL 依该事件识别群会话并路由发送。主界面对话视图 SHALL 渲染 `company-group/message` 事件为逐条标注说话人的消息（员工消息左对齐带名称标识，用户消息右对齐与普通用户消息一致）；主界面输入框在群会话上下文中 SHALL 将发送路由至该公司群的发送 remote（@提及经既有 host 路由生效）。公司控制台楼层面板的「公司群聊」入口 SHALL 打开（不存在则创建）该公司群并切换主界面到该会话；控制台内嵌群面板 SHALL 移除；员工发言经现有会话事件实时通道呈现在已打开的会话视图中。

#### Scenario: 主界面查看群历史

- **WHEN** 用户从会话侧栏打开一个公司群会话
- **THEN** 对话视图完整呈现群消息，逐条标注说话人（员工带名称标识，用户消息右对齐）

#### Scenario: 主界面发送群消息

- **WHEN** 用户在群会话上下文的主界面输入框发送消息
- **THEN** 消息以用户名义落入该公司群，包含 @显示名 的消息触发对应员工发言轮

#### Scenario: 楼层入口直达

- **WHEN** 用户在公司内部场景面板点击「公司群聊」
- **THEN** 该公司群被打开（不存在则创建），主界面切换到该会话，控制台浮层关闭

#### Scenario: 群会话识别

- **WHEN** 任一客户端持有某会话的事件流
- **THEN** 凭 `company-group/opened` 标记事件即可判定该会话为公司群并取得公司标识，不依赖会话头格式或 id 前缀
