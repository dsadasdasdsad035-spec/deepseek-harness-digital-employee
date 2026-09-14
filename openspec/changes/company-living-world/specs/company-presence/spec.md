# company-presence Delta — company-living-world

## ADDED Requirements

### Requirement: 员工到访史

系统 SHALL 为每个数字员工实例维护持久到访史：记录 SHALL 含最近若干次到访（地点名称与时间，容量上限截断）及最近出现信息，存储于 harness home 下的独立文件并经文件锁串行化。host SHALL 提供到访上报与读取 remote；客户端 SHALL 在员工到达各功能区（工位/茶水区/休息区/厕所/吸烟区/大门）时上报一次。到访史 SHALL 在服务重启与页面刷新后保留，作为实例持续存在的可见证据；地点 SHALL 为计划中的功能区名称，SHALL NOT 记录逐帧坐标。

#### Scenario: 上报与读取

- **WHEN** 一名员工到达吸烟区并被上报
- **THEN** 其到访史新增一条含地点与时间的记录，读取 remote 返回含该记录的历史

#### Scenario: 刷新后保留

- **WHEN** 页面刷新或服务重启后读取同一员工的到访史
- **THEN** 此前记录仍在，可证明该实例的持续存在

#### Scenario: 容量截断

- **WHEN** 一名员工的到访数超过上限
- **THEN** 最早的记录被丢弃，最近的上限条数保留
