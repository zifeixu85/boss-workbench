// 装进来的模块：模块开关用的编号、名字、依赖，今日页重点卡，模块自带的设置项。网页、服务端、命令行共用（scripts/module.mjs 生成，不要手改；改了模块的 module.json 运行 node scripts/module.mjs gen）
import type { ModuleDef, ModuleSettingDef } from './modules.ts'
import type { HomeCardDef } from './home.ts'

export const INSTALLED_MODULES: ModuleDef[] = []

export const INSTALLED_HOME: HomeCardDef[] = []

export const INSTALLED_SETTINGS: ModuleSettingDef[] = []
