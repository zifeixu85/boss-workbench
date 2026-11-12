// 老板工作台 · Mac 日历只读助手（工作台日历.app）
//
// 必须装在 .app 包里、用 `open` 启动：这样 LaunchServices 让它自己当“负责进程”，
// 日历权限记在它名下（bundle id com.boss-workbench.calendar），和谁启动它无关。
// 只读：不建、不改、不删日历里的任何东西。服务端调用方式见 server/calendar/mac.ts。
// 模板里带的是编好的成品（arm64 + x86_64，ad-hoc 签名）；改了这个文件才用 ../build.sh 重编，
// 重编后签名指纹变了，每台电脑都要重新点一次“允许”。不要在老板的电脑上重编。
//
//   --request          前台搭建时用：权限没定过就弹一次“允许访问日历”；其他模式永不弹窗
//   --status           只报告权限状态（不建 EKEventStore，不弹窗）
//   --demo             不碰日历，输出假数据（测 JSON 结构用）
//   --days N           读今天 0 点起 N 天（默认 14，最多 60）
//   --notes            带上备注（默认不带，备注里常有会议链接、电话等）
//   --out 路径         原子写入 JSON 文件；不给就打印到标准输出
//
// 退出码：0 读到了（或 status/demo 成功）；2 没有权限；1 其他错误。JSON 里 status 字段总会写。
import AppKit
import EventKit
import Foundation

struct Options {
    var request = false, statusOnly = false, demo = false, notes = false
    var days = 14
    var out: String?
}

func parseArgs() -> Options {
    var o = Options()
    var it = CommandLine.arguments.dropFirst().makeIterator()
    while let a = it.next() {
        switch a {
        case "--request": o.request = true
        case "--status": o.statusOnly = true
        case "--demo": o.demo = true
        case "--notes": o.notes = true
        case "--days": o.days = max(1, min(60, Int(it.next() ?? "") ?? 14))
        case "--out": o.out = it.next()
        default: break // 未知参数忽略（open 有时会塞 -psn_ 之类）
        }
    }
    return o
}

// 按原始值判断，兼容 macOS 13：.authorized（旧）与 .fullAccess（14+）都是 3，.writeOnly 是 4
func statusName(_ s: EKAuthorizationStatus) -> String {
    switch s.rawValue {
    case 0: return "notDetermined"
    case 1: return "restricted"
    case 2: return "denied"
    case 3: return "fullAccess"
    case 4: return "writeOnly" // 只能写不能读：对我们等于没权限
    default: return "unknown"
    }
}
func canRead(_ s: EKAuthorizationStatus) -> Bool { s.rawValue == 3 }

// 时间格式与工作台 events 表一致：定时日程本地时间 YYYY-MM-DDTHH:MM；全天日程只写日期，end 是结束后的那一天
let dayFmt: DateFormatter = { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f }()
let minFmt: DateFormatter = { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd'T'HH:mm"; return f }()
let isoFmt = ISO8601DateFormatter()

func hexColor(_ c: NSColor?) -> String? {
    guard let c = c?.usingColorSpace(.sRGB) else { return nil }
    return String(format: "#%02X%02X%02X", Int(c.redComponent * 255), Int(c.greenComponent * 255), Int(c.blueComponent * 255))
}

func sourceType(_ t: EKSourceType) -> String {
    switch t {
    case .local: return "local"; case .exchange: return "exchange"; case .calDAV: return "caldav"
    case .mobileMe: return "icloud"; case .subscribed: return "subscribed"; case .birthdays: return "birthdays"
    @unknown default: return "other"
    }
}

func emit(_ obj: [String: Any], to path: String?) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]) else { return }
    if let path = path {
        let url = URL(fileURLWithPath: path)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: .atomic) // 先写临时文件再改名，服务端不会读到半截
    } else {
        FileHandle.standardOutput.write(data); FileHandle.standardOutput.write("\n".data(using: .utf8)!)
    }
}

func base(_ status: String, _ o: Options, from: Date, to: Date) -> [String: Any] {
    ["version": 1, "source": "mac-calendar", "status": status, "generatedAt": isoFmt.string(from: Date()),
     "timeZone": TimeZone.current.identifier,
     "range": ["from": dayFmt.string(from: from), "to": dayFmt.string(from: to)]]
}

func readEvents(_ store: EKEventStore, _ o: Options, from: Date, to: Date) -> [String: Any] {
    // 生日、订阅的节假日日历也会进来；先全给，calendars 里带类型，让服务端/设置页决定要不要
    let cals = store.calendars(for: .event)
    let pred = store.predicateForEvents(withStart: from, end: to, calendars: cals) // 已展开重复日程；跨度 4 年以内
    let evs = store.events(matching: pred).sorted { $0.startDate < $1.startDate }
    let cal = Calendar.current
    var out: [[String: Any]] = []
    for e in evs {
        if e.status == .canceled { continue }
        var item: [String: Any] = [
            // externalIdentifier 跨设备稳定；同一重复日程的各次发生用开始时间区分
            "uid": e.calendarItemExternalIdentifier ?? e.calendarItemIdentifier,
            "occurrence": isoFmt.string(from: e.occurrenceDate ?? e.startDate),
            "title": e.title ?? "(无标题)",
            "allDay": e.isAllDay,
            "calendarId": e.calendar.calendarIdentifier,
            "recurring": e.hasRecurrenceRules,
        ]
        if e.isAllDay {
            item["start"] = dayFmt.string(from: e.startDate)
            let lastDay = cal.startOfDay(for: e.endDate.addingTimeInterval(-1))
            item["end"] = dayFmt.string(from: cal.date(byAdding: .day, value: 1, to: lastDay)!)
        } else {
            item["start"] = minFmt.string(from: e.startDate)
            item["end"] = minFmt.string(from: e.endDate)
        }
        if let l = e.location, !l.isEmpty { item["location"] = l }
        if let u = e.url { item["url"] = u.absoluteString }
        if o.notes, let n = e.notes, !n.isEmpty { item["notes"] = String(n.prefix(2000)) }
        if let me = e.attendees?.first(where: { $0.isCurrentUser }) {
            item["myResponse"] = ["unknown", "pending", "accepted", "declined", "tentative", "delegated", "completed", "inProcess"][min(Int(me.participantStatus.rawValue), 7)]
        }
        out.append(item)
    }
    var r = base("fullAccess", o, from: from, to: to)
    r["calendars"] = cals.map { c -> [String: Any] in
        var d: [String: Any] = ["id": c.calendarIdentifier, "title": c.title, "account": c.source.title, "type": sourceType(c.source.sourceType)]
        if let h = hexColor(c.color) { d["color"] = h }
        return d
    }
    r["events"] = out
    return r
}

func demo(_ o: Options, from: Date, to: Date) -> [String: Any] {
    var r = base("demo", o, from: from, to: to)
    r["calendars"] = [["id": "demo-cal", "title": "工作", "account": "iCloud", "type": "icloud", "color": "#1BADF8"]]
    let d0 = Calendar.current.date(byAdding: .day, value: 1, to: from)!
    r["events"] = [
        ["uid": "DEMO-1", "occurrence": isoFmt.string(from: d0.addingTimeInterval(15 * 3600)), "title": "和王总喝茶", "allDay": false,
         "start": minFmt.string(from: d0.addingTimeInterval(15 * 3600)), "end": minFmt.string(from: d0.addingTimeInterval(16 * 3600)),
         "location": "店里", "calendarId": "demo-cal", "recurring": false],
        ["uid": "DEMO-2", "occurrence": isoFmt.string(from: d0), "title": "展会", "allDay": true,
         "start": dayFmt.string(from: d0), "end": dayFmt.string(from: Calendar.current.date(byAdding: .day, value: 2, to: d0)!),
         "calendarId": "demo-cal", "recurring": false],
    ]
    return r
}

func requestAccess(_ store: EKEventStore) async -> Bool {
    // 弹窗由系统 tccd 画；先把自己设成辅助程序并激活，避免弹窗被压在别的窗口后面
    await MainActor.run {
        NSApplication.shared.setActivationPolicy(.accessory)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }
    if #available(macOS 14.0, *) {
        return (try? await store.requestFullAccessToEvents()) ?? false
    }
    return (try? await store.requestAccess(to: .event)) ?? false
}

@main
struct CalendarHelper {
    static func main() async {
        let o = parseArgs()
        let from = Calendar.current.startOfDay(for: Date())
        let to = Calendar.current.date(byAdding: .day, value: o.days, to: from)!

        if o.demo { emit(demo(o, from: from, to: to), to: o.out); exit(0) }

        var status = EKEventStore.authorizationStatus(for: .event) // 只查不弹
        if o.statusOnly { emit(base(statusName(status), o, from: from, to: to), to: o.out); exit(0) }

        // 没定过，或只给了“添加日程”（writeOnly）：只有 --request 才问；后台同步永远不弹窗
        if (status == .notDetermined || status.rawValue == 4) && o.request {
            let store = EKEventStore()
            _ = await requestAccess(store)
            status = EKEventStore.authorizationStatus(for: .event)
            // 刚授权后换一个新的 store 再读，旧实例可能还缓存着“无权限”
            if canRead(status) { emit(readEvents(EKEventStore(), o, from: from, to: to), to: o.out); exit(0) }
        }
        guard canRead(status) else {
            // 后台模式遇到 notDetermined 也不请求：弹窗只能在搭建时、用户看着的时候出现
            var r = base(statusName(status), o, from: from, to: to)
            r["events"] = [] as [Any]
            emit(r, to: o.out); exit(2)
        }
        let store = EKEventStore()
        emit(readEvents(store, o, from: from, to: to), to: o.out)
        exit(0)
    }
}
