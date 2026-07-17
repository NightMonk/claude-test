// TempoWidget — a WidgetKit starting point for a Home/Lock Screen widget.
//
// Add this as a Widget Extension target in the Xcode project Capacitor generates
// (File → New → Target → Widget Extension). It fetches today's tasks from your
// Tempo server and shows the next few plus a done/total count. Set `tempoBaseURL`
// and a read token (ideally shared from the main app via an App Group).
//
// This file is a scaffold: it compiles in Xcode with the standard WidgetKit
// template imports. It is intentionally minimal — style it to match the app.

import WidgetKit
import SwiftUI

// MARK: - Configuration
private let tempoBaseURL = "https://your-tempo-host.example.com"
private let tempoToken = "" // store securely; share from the app via an App Group

// MARK: - Model
struct TempoTask: Decodable {
    let id: Int
    let title: String
    let done: Int
    let due_at: String?
}

struct TempoEntry: TimelineEntry {
    let date: Date
    let tasks: [TempoTask]
    let doneCount: Int
    let total: Int
}

// MARK: - Provider
struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> TempoEntry {
        TempoEntry(date: Date(), tasks: [], doneCount: 0, total: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (TempoEntry) -> Void) {
        fetch { completion($0) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TempoEntry>) -> Void) {
        fetch { entry in
            // Refresh roughly every 30 minutes.
            let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private func fetch(_ done: @escaping (TempoEntry) -> Void) {
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        guard let url = URL(string: "\(tempoBaseURL)/api/tasks?bucket=today&today=\(today)") else {
            done(TempoEntry(date: Date(), tasks: [], doneCount: 0, total: 0)); return
        }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(tempoToken)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: req) { data, _, _ in
            let tasks = (data.flatMap { try? JSONDecoder().decode([TempoTask].self, from: $0) }) ?? []
            let open = tasks.filter { $0.done == 0 }
            done(TempoEntry(date: Date(), tasks: Array(open.prefix(3)), doneCount: tasks.count - open.count, total: tasks.count))
        }.resume()
    }
}

// MARK: - View
struct TempoWidgetEntryView: View {
    var entry: TempoEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Today").font(.caption).bold().foregroundStyle(.secondary)
                Spacer()
                Text("\(entry.doneCount)/\(entry.total)").font(.caption).bold()
                    .foregroundStyle(Color(red: 0.36, green: 0.36, blue: 0.84))
            }
            if entry.tasks.isEmpty {
                Text("All clear 🌿").font(.footnote).foregroundStyle(.secondary)
            } else {
                ForEach(entry.tasks, id: \.id) { t in
                    HStack(spacing: 6) {
                        Circle().stroke(.secondary, lineWidth: 1.5).frame(width: 10, height: 10)
                        Text(t.title).font(.footnote).lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
    }
}

// MARK: - Widget
@main
struct TempoWidget: Widget {
    let kind = "TempoWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            TempoWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Tempo — Today")
        .description("Your next few tasks and how many you've done today.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
