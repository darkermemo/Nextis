import SwiftUI
import Charts

// MARK: - NavigationMenu (SwiftUI equivalent)
struct NavigationMenu<Trigger: View, Content: View>: View {
    @State private var isOpen: Bool = false
    var trigger: () -> Trigger
    var content: () -> Content
    var body: some View {
        VStack(spacing: 0) {
            Button(action: { withAnimation(.spring(response: 0.25, dampingFraction: 0.9)) { isOpen.toggle() } }) {
                HStack(spacing: 6) {
                    trigger()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                        .animation(.easeInOut(duration: 0.2), value: isOpen)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(.systemBackground)))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(.separator), lineWidth: 1))
            }
            .buttonStyle(.plain)
            if isOpen {
                VStack(spacing: 0) {
                    content()
                }
                .padding(8)
                .background(RoundedRectangle(cornerRadius: 10).fill(Material.ultraThin))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator), lineWidth: 1))
                .transition(.asymmetric(insertion: .scale(scale: 0.95).combined(with: .opacity), removal: .opacity))
            }
        }
    }
}

// MARK: - Chip
struct ChipView: View {
    let text: String
    let color: Color
    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

// MARK: - EmptyState
struct EmptyStateView: View {
    let emoji: String
    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?
    var body: some View {
        VStack(spacing: 8) {
            Text(emoji).font(.system(size: 40))
            Text(title).font(.system(size: 17, weight: .semibold))
            Text(message).font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.center)
            if let title = actionTitle, let action = action {
                Button(title, action: action).buttonStyle(.borderedProminent).controlSize(.small)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
    }
}

// MARK: - QuickAdd FAB
struct QuickAddFAB: View {
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: "plus")
                Text("Quick Add")
            }
            .font(.system(size: 15, weight: .semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 18).fill(Color.blue))
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.12), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("quick_add_fab")
    }
}

// MARK: - Accordion
struct Accordion<Header: View, Content: View>: View {
    @State private var isOpen = false
    var header: () -> Header
    var content: () -> Content
    var body: some View {
        VStack(spacing: 0) {
            Button(action: { withAnimation(.easeInOut(duration: 0.2)) { isOpen.toggle() } }) {
                HStack { header(); Spacer(); Image(systemName: isOpen ? "chevron.up" : "chevron.down").font(.system(size: 12)) }
                    .padding(.horizontal, 12).padding(.vertical, 10)
                    .background(Color(.systemGray6))
            }.buttonStyle(.plain)
            if isOpen { content().transition(.opacity.combined(with: .move(edge: .top))) }
        }
        .overlay(Divider(), alignment: .bottom)
    }
}

// MARK: - Alert & AlertDialog
struct InlineAlert: View {
    enum Style { case info, success, warning, error }
    let style: Style; let title: String; let message: String?
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon).foregroundStyle(color)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13, weight: .semibold))
                if let message { Text(message).font(.system(size: 12)).foregroundStyle(.secondary) }
            }
        }
        .padding(12)
        .background(color.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
    private var color: Color { switch style { case .info: .blue; case .success: .green; case .warning: .orange; case .error: .red } }
    private var icon: String { switch style { case .info: "info.circle"; case .success: "checkmark.circle"; case .warning: "exclamationmark.triangle"; case .error: "xmark.octagon" } }
}

struct AlertDialog<Title: View, Content: View, Actions: View>: View {
    @Binding var isPresented: Bool
    var title: () -> Title
    var content: () -> Content
    var actions: () -> Actions
    var body: some View {
        Text("")
            .hidden()
            .sheet(isPresented: $isPresented) {
                NavigationStack { 
                    VStack { 
                        content() 
                    }
                    .padding()
                    .toolbar { 
                        actions() 
                    }
                    .navigationTitle("")
                    .navigationBarTitleDisplayMode(.inline)
                }
            }
    }
}

// MARK: - AspectRatio helper
struct AspectView<Content: View>: View {
    let ratio: CGFloat; let content: () -> Content
    var body: some View { content().aspectRatio(ratio, contentMode: .fit) }
}

// MARK: - Avatar
struct AvatarView: View { let text: String; var size: CGFloat = 32
    var body: some View { Text(text).font(.system(size: size * 0.35, weight: .semibold)).frame(width: size, height: size).background(Circle().fill(Color(.systemGray5))).foregroundStyle(.secondary) }
}

// MARK: - Badge
struct BadgeView: View { let text: String; var color: Color = .blue
    var body: some View { Text(text).font(.system(size: 11, weight: .medium)).padding(.horizontal, 8).padding(.vertical, 3).background(color.opacity(0.12)).foregroundStyle(color).clipShape(Capsule()) }
}

// MARK: - Breadcrumb
struct Breadcrumbs: View { let items: [String]
    var body: some View { HStack(spacing: 6) { ForEach(Array(items.enumerated()), id: \.offset) { idx, s in HStack(spacing: 6) { Text(s).font(.system(size: 12)); if idx < items.count - 1 { Image(systemName: "chevron.right").font(.system(size: 10)).foregroundStyle(.secondary) } } } } }
}

// MARK: - Buttons (styles)
struct PrimaryButtonStyle: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label.padding(.horizontal, 12).padding(.vertical, 8).background(RoundedRectangle(cornerRadius: 10).fill(Color.blue.opacity(configuration.isPressed ? 0.85 : 1))).foregroundStyle(.white) } }
struct OutlineButtonStyle: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label.padding(.horizontal, 12).padding(.vertical, 8).background(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator))).foregroundStyle(.primary) } }

// MARK: - Card
struct Card<Content: View>: View { let content: () -> Content
    var body: some View { VStack(alignment: .leading, spacing: 8) { content() }.padding(12).background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground))) }
}

// MARK: - Carousel (simple pager)
struct Carousel<Content: View>: View {
    let pages: [Content]
    @State private var idx: Int = 0
    var body: some View {
        TabView(selection: $idx) { ForEach(pages.indices, id: \.self) { i in pages[i].tag(i) } }
            .tabViewStyle(.page)
    }
}

// MARK: - Chart (basic line)
struct LineChart: View {
    struct Point: Identifiable { let id = UUID(); let x: Date; let y: Double }
    let points: [Point]
    var body: some View { Chart(points) { LineMark(x: .value("x", $0.x), y: .value("y", $0.y)) } }
}

// MARK: - Checkbox
struct Checkbox: View { @Binding var isOn: Bool; var label: String
    var body: some View { Button(action: { isOn.toggle() }) { HStack { Image(systemName: isOn ? "checkmark.square.fill" : "square"); Text(label) } }.buttonStyle(.plain) }
}

// MARK: - Collapsible
struct Collapsible<Header: View, Content: View>: View {
    @State private var open = false
    var header: () -> Header; var content: () -> Content
    var body: some View { VStack(spacing: 0) { Button(action: { withAnimation(.easeInOut(duration: 0.2)) { open.toggle() } }) { HStack { header(); Spacer(); Image(systemName: open ? "chevron.up" : "chevron.down").font(.system(size: 12)) }.padding(8) }.buttonStyle(.plain); if open { content().transition(.opacity) } } }
}

// MARK: - Command Palette (very simple)
struct CommandPalette: View { @Binding var isPresented: Bool; let commands: [String]; let onSelect: (String) -> Void
    @State private var query = ""
    var body: some View {
        EmptyView().sheet(isPresented: $isPresented) {
            NavigationStack {
                List(filtered, id: \.self) { cmd in Button(cmd) { onSelect(cmd); isPresented = false } }
                    .searchable(text: $query)
                    .navigationTitle("Command")
            }
        }
    }
    private var filtered: [String] { query.isEmpty ? commands : commands.filter { $0.localizedCaseInsensitiveContains(query) } }
}

// MARK: - Context Menu helper
extension View { func contextMenuItems(_ items: [String], onSelect: @escaping (String) -> Void) -> some View { self.contextMenu { ForEach(items, id: \.self) { title in Button(title) { onSelect(title) } } } }
}

// MARK: - Dialog helper
struct DialogView<Content: View>: View { @Binding var isPresented: Bool; let content: () -> Content
    var body: some View { EmptyView().sheet(isPresented: $isPresented) { content() } }
}


