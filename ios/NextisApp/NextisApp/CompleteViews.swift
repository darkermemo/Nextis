import SwiftUI

// MARK: - Notification Names for cross-tab updates
extension Notification.Name {
	static let itemsCreated = Notification.Name("com.nextis.itemsCreated")
	static let itemsUpdated = Notification.Name("com.nextis.itemsUpdated")
}

// MARK: - Chat View (matching web chat-view.tsx exactly)
struct ChatViewFull: View {
	let client: APIClient
	@Environment(\.horizontalSizeClass) private var hSizeClass
	@State private var messages: [ChatMessage] = []
	@State private var input = ""
	@State private var nextActions: NextActions?
	@State private var sending = false
	@State private var earlyWork = false
	@State private var isNextActionsExpanded = true
	
	struct ChatMessage: Identifiable {
		let id = UUID()
		let type: MsgType
		let content: String
		let timestamp = Date()
        let timestampText: String?
		let changes: [String]?
		enum MsgType { case user, assistant }
	}
	
	var body: some View {
		GeometryReader { geometry in
			let s = scale(for: geometry.size.width)
			VStack(spacing: 0) {
				// Chat Messages Area
				ScrollViewReader { proxy in
					ScrollView {
						LazyVStack(spacing: 12 * s) {
							// Show Next Actions at top if available
							if let items = nextActions?.items, !items.isEmpty {
								VStack(alignment: .leading, spacing: 8 * s) {
									HStack {
										Image(systemName: "bolt.fill")
											.font(.system(size: 12 * s))
											.foregroundStyle(.blue)
										Text("Next 3 Actions")
											.font(.system(size: 14 * s, weight: .semibold))
										Spacer()
										Text("Just now")
											.font(.system(size: 10 * s))
											.foregroundStyle(.secondary)
									}
									ForEach(Array(items.prefix(3).enumerated()), id: \.offset) { idx, item in
										NextActionRowView(
											index: idx + 1,
											title: item.title,
											priority: item.priority,
											deadlineISO: item.deadline,
											onAction: {},
											scale: s
										)
									}
								}
								.padding(12 * s)
								.background(Color(.secondarySystemBackground))
								.clipShape(RoundedRectangle(cornerRadius: 12 * s))
								.padding(.horizontal, 16 * s)
								.padding(.top, 12 * s)
							}
							
							// Chat messages
							ForEach(messages) { message in
								MessageBubble(message: message, maxBubbleWidth: geometry.size.width * (hSizeClass == .regular ? 0.6 : 0.75), scale: s)
							}
							
							// Empty state with suggestions
							if messages.isEmpty && !sending {
								VStack(spacing: 16 * s) {
									Spacer().frame(height: 40 * s)
									
									ZStack {
										Circle()
											.fill(LinearGradient(colors: [.blue.opacity(0.1), .purple.opacity(0.1)], startPoint: .topLeading, endPoint: .bottomTrailing))
											.frame(width: 80 * s, height: 80 * s)
										Image(systemName: "brain.head.profile")
											.font(.system(size: 36 * s))
											.foregroundStyle(.blue)
									}
									
									Text("Your AI Assistant")
										.font(.system(size: 20 * s, weight: .bold))
									
									Text("Ask me anything about your schedule, tasks, or let me help you plan your day")
										.font(.system(size: 14 * s))
										.foregroundStyle(.secondary)
										.multilineTextAlignment(.center)
										.padding(.horizontal, 32 * s)
									
									VStack(spacing: 8 * s) {
										Text("Try asking:")
											.font(.system(size: 12 * s, weight: .medium))
											.foregroundStyle(.secondary)
										
										ForEach(["What's on my schedule today?", "Add a task for tomorrow", "Show my next 3 actions"], id: \.self) { suggestion in
											Button(action: { 
												input = suggestion
												Task { await send() }
											}) {
												Text(suggestion)
													.font(.system(size: 13 * s))
													.padding(.horizontal, 16 * s)
													.padding(.vertical, 10 * s)
													.frame(maxWidth: .infinity)
													.background(Color(.secondarySystemBackground))
													.foregroundStyle(.primary)
													.clipShape(RoundedRectangle(cornerRadius: 10 * s))
											}
											.buttonStyle(.plain)
										}
									}
									.padding(.horizontal, 16 * s)
									.padding(.top, 8 * s)
									
									Spacer()
								}
								.frame(maxWidth: .infinity)
							}
							
							if sending {
								HStack(spacing: 8 * s) {
									ZStack {
										LinearGradient(colors: [.blue, .purple], startPoint: .topLeading, endPoint: .bottomTrailing)
										ProgressView().tint(.white)
									}
									.frame(width: 24 * s, height: 24 * s).clipShape(Circle())
									VStack(alignment: .leading, spacing: 1) {
										Text("Processing...").font(.system(size: 11 * s)).foregroundStyle(.secondary)
									}
									Spacer()
								}
								.padding(8 * s)
							}
							
							Color.clear.frame(height: 1).id("bottom")
						}
						.padding(.bottom, 16 * s)
					}
					.onChange(of: messages.count) { _, _ in
						withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) }
					}
				}
				.frame(maxHeight: .infinity)
				
				// Chat Input Area (modern design)
				VStack(spacing: 0) {
					Divider()
					
					HStack(spacing: 12 * s) {
						HStack(spacing: 8 * s) {
							TextField("Ask anything...", text: $input, axis: .vertical)
								.font(.system(size: 15 * s))
								.lineLimit(1...4)
								.disabled(sending)
								.submitLabel(.send)
								.onSubmit { Task { await send() } }
							
							if !input.isEmpty {
								Button(action: { input = "" }) {
									Image(systemName: "xmark.circle.fill")
										.font(.system(size: 18 * s))
										.foregroundStyle(.secondary)
								}
								.buttonStyle(.plain)
							}
						}
						.padding(.horizontal, 14 * s)
						.padding(.vertical, 10 * s)
						.background(Color(.secondarySystemBackground))
						.clipShape(RoundedRectangle(cornerRadius: 20 * s))
						
						Button(action: { Task { await send() } }) {
							ZStack {
								Circle()
									.fill(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color(.systemGray4) : Color.blue)
								Image(systemName: "arrow.up")
									.font(.system(size: 16 * s, weight: .semibold))
									.foregroundStyle(.white)
							}
							.frame(width: 36 * s, height: 36 * s)
						}
						.buttonStyle(.plain)
						.disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sending)
					}
					.padding(.horizontal, 16 * s)
					.padding(.top, 12 * s)
					.padding(.bottom, max(12 * s, geometry.safeAreaInsets.bottom + 8 * s))
					.background(Color(.systemBackground))
				}
			}
		}
		.task {
			await loadNext()
		}
	}
	
    private func loadSampleMessages() {
		if messages.isEmpty {
            // Match TSX sample conversation
            messages.append(.init(type: .assistant, content: "Good morning! I've organized your day based on your schedule. You have 3 priority tasks and 2 meetings today.", timestampText: "9:00 AM", changes: nil))
            messages.append(.init(type: .user, content: "What should I focus on first?", timestampText: "9:02 AM", changes: nil))
            messages.append(.init(type: .assistant, content: "I recommend starting with your deep work session on the project proposal. You're most productive in the morning, and this task requires 2 hours of focused time.", timestampText: "9:02 AM", changes: nil))
		}
	}
	
	private func loadNext() async {
		nextActions = try? await client.getNext()
	}
	
	private func send() async {
		guard !input.isEmpty else { return }
		let txt = input
		input = ""
		sending = true
		
        messages.append(.init(type: .user, content: txt, timestampText: Date().formatted(date: .omitted, time: .shortened), changes: nil))
		
			do {
			let resp = try await client.sendChatMessage(txt)
			
			// Show what was created
			var responseText = ""
			if !resp.changes.isEmpty {
				responseText = resp.changes.joined(separator: "\n")
			}
			if !resp.message.isEmpty {
				if !responseText.isEmpty {
					responseText += "\n\n" + resp.message
				} else {
					responseText = resp.message
				}
			}
			
			if responseText.isEmpty {
				responseText = "✅ Done! I've added that to your schedule."
			}
			
			// If backend created items, append a short, explicit summary
			if !resp.items.isEmpty {
				let createdList = resp.items.prefix(5).enumerated().map { idx, it in
					let when: String = {
						if let s = it.start, let d = ISO8601DateFormatter().date(from: s) { return DateFormatter.localizedString(from: d, dateStyle: .none, timeStyle: .short) }
						if let d = it.deadline, let dd = ISO8601DateFormatter().date(from: d) { return DateFormatter.localizedString(from: dd, dateStyle: .short, timeStyle: .short) }
						return "unscheduled"
					}()
					return "\(idx+1). \(it.title) — \(when)"
				}.joined(separator: "\n")
				responseText += (responseText.isEmpty ? "" : "\n\n") + "✅ Created \(resp.items.count) item(s):\n" + createdList
			}

			messages.append(.init(type: .assistant, content: responseText, timestampText: Date().formatted(date: .omitted, time: .shortened), changes: resp.changes))
			
			// Refresh Next Actions to show newly created items
			await loadNext()

			// If user asked to show next actions explicitly, answer with a list
			let lowered = txt.lowercased()
			if lowered.contains("next 3 actions") || lowered.contains("next actions") || lowered.contains("what's next") || lowered.contains("show my next") {
				if let data = nextActions, !data.items.isEmpty {
					let list = data.items.prefix(3).enumerated().map { idx, it in
						"\(idx+1). \(it.title)"
					}.joined(separator: "\n")
					let answer = "Here are your next 3 actions:\n" + list
					messages.append(.init(type: .assistant, content: answer, timestampText: Date().formatted(date: .omitted, time: .shortened), changes: nil))
				} else {
					messages.append(.init(type: .assistant, content: "You have no next actions right now.", timestampText: Date().formatted(date: .omitted, time: .shortened), changes: nil))
				}
			}
			
			// If items were created, notify other tabs to refresh
			if !resp.items.isEmpty {
				print("✅ Created \(resp.items.count) item(s):")
				for item in resp.items {
					print("  - \(item.title) (type: \(item.type.rawValue))")
				}
				
				// Notify Calendar and Tasks tabs to refresh
				NotificationCenter.default.post(name: .itemsCreated, object: resp.items)
			}
		} catch {
			print("❌ Chat API Error: \(error.localizedDescription)")
			if let urlError = error as? URLError {
				print("  URLError code: \(urlError.code.rawValue)")
				print("  URLError description: \(urlError.localizedDescription)")
			}
			// Fallback: call agent endpoint to try tool calling (more robust)
			if let agent = try? await client.agentRespond(txt), let summary = agent.summary, !summary.isEmpty {
				messages.append(.init(type: .assistant, content: summary, timestampText: Date().formatted(date: .omitted, time: .shortened), changes: nil))
				await loadNext()
			} else {
				messages.append(.init(type: .assistant, content: "Sorry, I couldn't process that request.\n\n⚠️ Error: \(error.localizedDescription)", timestampText: Date().formatted(date: .omitted, time: .shortened), changes: nil))
			}
		}
		
		sending = false
	}
}

// Using EmptyStateView from DesignKit.swift

// MARK: - Chip Component
private struct Chip: View {
	let text: String
	let color: Color
	var body: some View {
		Text(text)
			.font(.system(size: 9))
			.padding(.horizontal, 4)
			.padding(.vertical, 1)
			.background(color.opacity(0.15))
			.foregroundStyle(color)
			.clipShape(Capsule())
	}
}

struct Next3ActionsCard: View {
	let nextActions: NextActions?
	let client: APIClient
	
	var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "bolt.fill").font(.system(size: 12)).foregroundStyle(.blue)
                Text("Next 3 Actions").font(.system(size: 14, weight: .semibold))
                Spacer()
                Text("Updated 2m ago").font(.system(size: 10)).foregroundStyle(.secondary)
            }
            if let items = nextActions?.items, !items.isEmpty {
                ForEach(Array(items.prefix(3).enumerated()), id: \.offset) { idx, item in
                    HStack(spacing: 12) {
                        Text("\(idx+1)")
                            .font(.system(size: 11, weight: .bold))
                            .frame(width: 24, height: 24)
                            .background(Color.blue)
                            .foregroundStyle(.white)
                            .clipShape(Circle())
                        Text(item.title)
                            .font(.system(size: 14))
                            .lineLimit(1)
                        Spacer()
                        if let deadline = item.deadline {
                            HStack(spacing: 4) {
                                Image(systemName: "clock").font(.system(size: 10))
                                Text(formatDate(deadline)).font(.system(size: 11)).foregroundStyle(.secondary)
                            }
                        }
                        Button(action: {}) {
                            Image(systemName: "play.fill").font(.system(size: 12))
                                .foregroundStyle(.white)
                                .padding(8)
                                .background(RoundedRectangle(cornerRadius: 10).fill(Color.blue))
                        }.buttonStyle(.plain)
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 10)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            } else {
                EmptyStateView(emoji: "⚡️", title: "No actions", message: "Add tasks to get started!", actionTitle: nil, action: nil)
            }
        }
        .padding(12)
        .background(.ultraThinMaterial)
        .overlay(Divider(), alignment: .bottom)
	}
	
	private func priorityColor(_ p: Priority) -> Color {
		switch p {
		case .high: return .red
		case .normal: return .orange
		case .low: return .gray
		}
	}
	
	private func formatDate(_ iso: String) -> String {
		guard let date = ISO8601DateFormatter().date(from: iso) else { return "" }
		let formatter = DateFormatter()
		formatter.dateFormat = "MMM d"
		return formatter.string(from: date)
	}
}

struct MessageBubble: View {
	let message: ChatViewFull.ChatMessage
    let maxBubbleWidth: CGFloat
    var scale: CGFloat = 1.0
	
	var body: some View {
        HStack(alignment: .top, spacing: 10 * scale) {
            if message.type == .assistant { 
                ZStack {
                    Circle()
                        .fill(LinearGradient(colors: [.blue, .purple], startPoint: .topLeading, endPoint: .bottomTrailing))
                    Text("AI")
                        .font(.system(size: 11 * scale, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 32 * scale, height: 32 * scale)
            }
			
            VStack(alignment: message.type == .user ? .trailing : .leading, spacing: 4 * scale) {
                Text(message.content)
                    .font(.system(size: 15 * scale))
                    .padding(.horizontal, 14 * scale)
                    .padding(.vertical, 12 * scale)
                    .background(message.type == .user ? Color.blue : Color(.secondarySystemBackground))
                    .foregroundStyle(message.type == .user ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 18 * scale))
                    .frame(maxWidth: maxBubbleWidth, alignment: message.type == .user ? .trailing : .leading)
                
                Text(message.timestampText ?? formatTime(message.timestamp))
                    .font(.system(size: 11 * scale))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4 * scale)
            }
            .frame(maxWidth: .infinity, alignment: message.type == .user ? .trailing : .leading)
            
            if message.type == .user { 
                ZStack {
                    Circle()
                        .fill(Color(.systemGray5))
                    Text("JD")
                        .font(.system(size: 12 * scale, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
                .frame(width: 32 * scale, height: 32 * scale)
            }
		}
        .padding(.horizontal, 16 * scale)
	}
	
	private func formatTime(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "h:mm a"; f.amSymbol = "AM"; f.pmSymbol = "PM"
        return f.string(from: date)
    }
}

private struct AvatarCircle: View {
    let text: String
	var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold))
						.foregroundStyle(.secondary)
            .frame(width: 28, height: 28)
            .background(Circle().fill(Color(.tertiarySystemBackground)))
    }
}

// MARK: - Adaptive scale helper
private func scale(for width: CGFloat) -> CGFloat {
    // Base design around ~390pt width (iPhone 15/Pro). Clamp between 0.9 and 1.2
    let base: CGFloat = 390
    let s = max(0.9, min(1.2, width / base))
    return s
}

// MARK: - Next Action Row (TSX-style)
struct NextActionRowView: View {
    let index: Int
    let title: String
    let priority: Priority?
    let deadlineISO: String?
    var onAction: () -> Void
    var scale: CGFloat = 1.0
    var body: some View {
        HStack(spacing: 12 * scale) {
            Text("\(index)")
                .font(.system(size: 11 * scale, weight: .bold))
                .frame(width: 24 * scale, height: 24 * scale)
                .background(Color.blue)
                .foregroundStyle(.white)
                .clipShape(Circle())
                .accessibilityHidden(true)
            Text(title)
                .font(.system(size: 14 * scale))
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 8 * scale) {
                if let p = priority {
                    Text(priorityLabel(p))
                        .font(.system(size: 11 * scale, weight: .medium))
                        .padding(.horizontal, 6 * scale)
                        .padding(.vertical, 3 * scale)
                        .background(priorityColor(p).opacity(0.12))
                        .foregroundStyle(priorityColor(p))
                        .clipShape(Capsule())
                }
                if let deadlineISO, !deadlineISO.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "clock").font(.system(size: 11 * scale)).foregroundStyle(.secondary)
                        Text(formatDeadline(deadlineISO))
                            .font(.system(size: 11 * scale))
                            .foregroundStyle(.secondary)
                    }
                }
                Button(action: onAction) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 12 * scale))
                        .foregroundStyle(.white)
                        .padding(8 * scale)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Color.blue))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 10 * scale)
        .padding(.horizontal, 16 * scale)
        .contentShape(Rectangle())
    }
    private func priorityColor(_ p: Priority) -> Color { switch p { case .high: return .red; case .normal: return .orange; case .low: return .gray } }
    private func priorityLabel(_ p: Priority) -> String { switch p { case .high: return "high"; case .normal: return "medium"; case .low: return "low" } }
    private func formatDeadline(_ isoOrLabel: String) -> String {
        // Accept either a preformatted label (e.g., "10:00 AM") or ISO8601 datetime
        if let date = ISO8601DateFormatter().date(from: isoOrLabel) {
            let f = DateFormatter(); f.dateFormat = "h:mm a"; f.amSymbol = "AM"; f.pmSymbol = "PM"
            return f.string(from: date)
        }
        return isoOrLabel
    }
}

struct LegendItem: View {
	let color: Color
	let label: String
	
	var body: some View {
		HStack(spacing: 6) {
			RoundedRectangle(cornerRadius: 2)
				.fill(color)
				.frame(width: 12, height: 12)
			Text(label)
				.font(.caption2)
				.foregroundStyle(.secondary)
		}
	}
}

// MARK: - Calendar List (TSX-style clone)
struct CalendarListTSXView: View {
    let client: APIClient
    @State private var selectedDate: Date = Date()
    @State private var weekStart: Date = Calendar.current.mondayStartOfWeek(for: Date())
    @State private var data: CalendarResponse?
	
	var body: some View {
        GeometryReader { geo in
            let s = scale(for: geo.size.width)
		VStack(spacing: 0) {
            // Month Navigation
            HStack {
                Text(formatMonth(selectedDate))
                    .font(.system(size: 17 * s, weight: .semibold))
                Spacer()
                HStack(spacing: 8 * s) {
                    Button(action: { shiftWeek(-1) }) { Image(systemName: "chevron.left").font(.system(size: 18 * s)) }
                        .buttonStyle(.bordered)
                        .controlSize(.regular)
                    Button("Today") { selectedDate = Date(); weekStart = Calendar.current.mondayStartOfWeek(for: Date()) }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.regular)
                    Button(action: { shiftWeek(1) }) { Image(systemName: "chevron.right").font(.system(size: 18 * s)) }
                        .buttonStyle(.bordered)
                        .controlSize(.regular)
                }
            }
            .padding(.horizontal, 16 * s)
            .padding(.vertical, 10 * s)
            .overlay(Divider(), alignment: .bottom)
            
            // Week Days Selector
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8 * s) {
                    ForEach(weekDates(), id: \.self) { day in
                        let isSelected = Calendar.current.isDate(day, inSameDayAs: selectedDate)
                        let today = Calendar.current.isDateInToday(day)
                        Button(action: { selectedDate = day }) {
                            VStack(spacing: 4 * s) {
                                Text(formatDayName(day))
                                    .font(.system(size: 11 * s))
                                    .foregroundStyle(isSelected ? .white.opacity(0.8) : .secondary)
                                Text("\(Calendar.current.component(.day, from: day))")
                                    .font(.system(size: 17 * s, weight: .medium))
                                    .foregroundStyle(isSelected ? .white : (today ? .blue : .primary))
                                if hasEvents(on: day) {
                                    Circle().fill(isSelected ? Color.white : Color.blue)
                                        .frame(width: 4 * s, height: 4 * s)
                                }
                            }
                            .padding(.vertical, 8 * s)
                            .padding(.horizontal, 10 * s)
                            .background(isSelected ? Color.blue : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: 12 * s))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12 * s)
                .padding(.vertical, 10 * s)
                .background(Color(.systemGray6))
                .overlay(Divider(), alignment: .bottom)
            }
            
            // Events List
            ScrollView {
                VStack(spacing: 8 * s) {
                    let events = eventsForDate(selectedDate)
                    if events.isEmpty {
                        VStack(spacing: 16 * s) {
                            Spacer().frame(height: 40 * s)
                            
                            ZStack {
                                Circle()
                                    .fill(LinearGradient(colors: [.blue.opacity(0.1), .purple.opacity(0.1)], startPoint: .topLeading, endPoint: .bottomTrailing))
                                    .frame(width: 80 * s, height: 80 * s)
                                Image(systemName: Calendar.current.isDateInToday(selectedDate) ? "sun.max.fill" : "calendar")
                                    .font(.system(size: 36 * s))
                                    .foregroundStyle(.blue)
                            }
                            
                            Text(Calendar.current.isDateInToday(selectedDate) ? "Free Day!" : "No Events")
                                .font(.system(size: 20 * s, weight: .bold))
                            
                            Text(Calendar.current.isDateInToday(selectedDate) ? "Enjoy your free time today!" : "No events scheduled for this day")
                                .font(.system(size: 14 * s))
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 32 * s)
                            
                            Spacer()
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16 * s)
                    } else {
                        ForEach(events) { item in
                            CalendarEventRowTSX(item: item, scale: s)
                        }
                    }
                    
                    if !events.isEmpty {
                        // Week Overview
                        Divider().padding(.top, 8 * s)
                        VStack(alignment: .leading, spacing: 8 * s) {
                            Text("This Week").font(.system(size: 13 * s, weight: .semibold)).foregroundStyle(.secondary)
                            VStack(spacing: 8 * s) {
                                ForEach(weekEvents(), id: \.date) { grp in
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                        Text("\(formatDayName(grp.date)), \(Calendar.current.dateComponents([.day], from: grp.date).day ?? 0)")
                                                .font(.system(size: 13 * s, weight: .medium))
                                            Text("\(grp.events.count) event\(grp.events.count == 1 ? "" : "s")")
                                                .font(.system(size: 11 * s))
                                                .foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        HStack(spacing: 6 * s) {
                                            ForEach(Array(grp.events.prefix(3).enumerated()), id: \.offset) { _, e in
                                                Circle().fill(typeStyle(e.type).dot).frame(width: 8 * s, height: 8 * s)
                                            }
                                        }
                                    }
                                    .padding(.vertical, 8 * s)
                                    .padding(.horizontal, 12 * s)
                                    .background(Color(.systemGray6))
                                    .clipShape(RoundedRectangle(cornerRadius: 10 * s))
                                }
                            }
                        }
                        .padding(.top, 10 * s)
                    }
                }
                .padding(16 * s)
            }
            }
        }
        .task { await load() }
        .onChange(of: weekStart) { _, _ in Task { await load() } }
		.onReceive(NotificationCenter.default.publisher(for: .itemsCreated)) { _ in
			Task { await load() }
		}
    }
    
    // MARK: - Data
    private func load() async {
        let iso = ISO8601DateFormatter().string(from: weekStart)
        data = try? await client.getCalendar(weekStartISO: iso)
    }
    
    // MARK: - Helpers
    private func shiftWeek(_ delta: Int) {
        if let newStart = Calendar.current.date(byAdding: .day, value: delta * 7, to: weekStart) {
            weekStart = Calendar.current.mondayStartOfWeek(for: newStart)
            selectedDate = weekStart
        }
    }
    private func weekDates() -> [Date] { (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: weekStart) } }
    private func formatMonth(_ date: Date) -> String { date.formatted(.dateTime.month(.wide).year()) }
    private func formatDayName(_ date: Date) -> String { date.formatted(.dateTime.weekday(.abbreviated)) }
    private func hasEvents(on date: Date) -> Bool { !(eventsForDate(date).isEmpty) }
    private func eventsForDate(_ date: Date) -> [Item] {
        guard let items = data?.items else { return [] }
        return items.filter { item in
            guard let startStr = item.start, let start = ISO8601DateFormatter().date(from: startStr) else { return false }
            return Calendar.current.isDate(start, inSameDayAs: date)
        }.sorted { a, b in
            let fa: Date = ISO8601DateFormatter().date(from: a.start ?? "") ?? .distantPast
            let fb: Date = ISO8601DateFormatter().date(from: b.start ?? "") ?? .distantPast
            return fa < fb
        }
    }
    private func weekEvents() -> [(date: Date, events: [Item])] {
        weekDates().compactMap { d in
            let ev = eventsForDate(d)
            return ev.isEmpty ? nil : (d, ev)
        }
    }
    private func typeStyle(_ t: ItemType) -> (bg: Color, border: Color, text: Color, dot: Color, icon: Color) {
        switch t {
        case .task: return (.blue.opacity(0.08), .blue, .blue, .blue, .blue) // study
        case .event: return (.purple.opacity(0.08), .purple, .purple, .purple, .purple)
        case .breakTime: return (.green.opacity(0.08), .green, .green, .green, .green)
        case .leisure: return (.orange.opacity(0.08), .orange, .orange, .orange, .orange)
        case .quiz: return (.red.opacity(0.08), .red, .red, .red, .red)
        }
    }
}

private struct CalendarEventRowTSX: View {
	let item: Item
    var scale: CGFloat = 1.0
	var body: some View {
        let style = typeStyle(item.type)
        return Button(action: { /* open details later */ }) {
            VStack(alignment: .leading, spacing: 8 * scale) {
                HStack(alignment: .top) {
				Text(item.title)
                        .font(.system(size: 15 * scale, weight: .semibold))
					.lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button(action: {}) {
                        Image(systemName: "ellipsis").font(.system(size: 16 * scale)).foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                HStack(spacing: 8 * scale) {
                    RoundedRectangle(cornerRadius: 8 * scale)
                        .fill(style.icon)
                        .frame(width: 28 * scale, height: 28 * scale)
                        .overlay(Image(systemName: "clock").font(.system(size: 14 * scale)).foregroundStyle(.white))
                    Text("\(formatTime(item.start)) - \(formatTime(item.end))")
                        .font(.system(size: 13 * scale))
                        .foregroundStyle(.secondary)
                }
                if let notes = item.notes, !notes.isEmpty {
                    Text(notes).font(.system(size: 13 * scale)).foregroundStyle(.secondary)
                }
                HStack(spacing: 6 * scale) {
                    Circle().fill(style.dot).frame(width: 8 * scale, height: 8 * scale)
                    Text(typeLabel(item.type)).font(.system(size: 11 * scale)).foregroundStyle(.secondary)
                }
                .padding(.top, 4 * scale)
                .overlay(Divider(), alignment: .top)
            }
            .padding(12 * scale)
            .background(style.bg)
            .overlay(Rectangle().fill(style.border).frame(width: 4 * scale), alignment: .leading)
            .clipShape(RoundedRectangle(cornerRadius: 12 * scale))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
    private func typeLabel(_ t: ItemType) -> String { switch t { case .task: return "study"; case .event: return "event"; case .breakTime: return "break"; case .leisure: return "leisure"; case .quiz: return "quiz" } }
    private func typeStyle(_ t: ItemType) -> (bg: Color, border: Color, text: Color, dot: Color, icon: Color) {
		switch t {
        case .task: return (.blue.opacity(0.08), .blue, .blue, .blue, .blue)
        case .event: return (.purple.opacity(0.08), .purple, .purple, .purple, .purple)
        case .breakTime: return (.green.opacity(0.08), .green, .green, .green, .green)
        case .leisure: return (.orange.opacity(0.08), .orange, .orange, .orange, .orange)
        case .quiz: return (.red.opacity(0.08), .red, .red, .red, .red)
        }
    }
    private func formatTime(_ iso: String?) -> String {
        guard let iso, let d = ISO8601DateFormatter().date(from: iso) else { return "" }
        let f = DateFormatter(); f.dateFormat = "h:mm a"; f.amSymbol = "AM"; f.pmSymbol = "PM"; return f.string(from: d)
    }
}

// MARK: - Monday week helper
extension Calendar {
    func mondayStartOfWeek(for date: Date) -> Date {
        let weekday = component(.weekday, from: date) // 1=Sun ... 7=Sat
        let daysToMonday = (weekday == 1) ? -6 : 2 - weekday
        let start = self.date(byAdding: .day, value: daysToMonday, to: startOfDay(for: date)) ?? date
        return start
	}
}

// MARK: - Learning View (matching web with nested cards)
struct LearningViewFull: View {
	let client: APIClient
	@State private var prefs: LearningPreferencesResponse?
	@State private var insights: LearningInsights?
	@State private var user: UserProfile?
	@State private var localEvening = false
	@State private var localFocus = 60
	@State private var localBreaks = true
	
	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 16) {
				// Header
				HStack {
					ZStack {
						LinearGradient(colors: [.blue, .purple], startPoint: .topLeading, endPoint: .bottomTrailing)
						Image(systemName: "brain.head.profile").foregroundStyle(.white)
					}
					.frame(width: 40, height: 40)
					.clipShape(RoundedRectangle(cornerRadius: 10))
					
					VStack(alignment: .leading, spacing: 2) {
						Text("Learning Dashboard").font(.title3.weight(.bold))
						Text("Habit patterns and preferences").font(.caption).foregroundStyle(.secondary)
					}
					
					Spacer()
					
					HStack(spacing: 8) {
						Button(action: { Task { await updateLearning() } }) {
							HStack(spacing: 4) {
								Image(systemName: "arrow.clockwise")
								Text("Update")
							}
							.font(.caption)
						}
						.buttonStyle(.bordered)
						.controlSize(.small)
						
						Button(action: { Task { await resetLearning() } }) {
							HStack(spacing: 4) {
								Image(systemName: "arrow.counterclockwise")
								Text("Reset")
							}
							.font(.caption)
						}
						.buttonStyle(.bordered)
						.controlSize(.small)
					}
				}
				
				// Weekday Patterns & Best Windows
				HStack(spacing: 16) {
					WeekdayPatternsCard(insights: insights)
					BestWindowsCard(prefs: prefs)
				}
				
				// Learned Lengths
				LearnedLengthsCard(prefs: prefs)
				
				// Recent Trends & Total Stats
				HStack(spacing: 16) {
					RecentTrendsCard(insights: insights)
					TotalStatsCard(prefs: prefs)
				}
				
				// Preferences
				PreferencesCard(
					localEvening: $localEvening,
					localFocus: $localFocus,
					localBreaks: $localBreaks,
					client: client
				)
				
				// Health Tracker
				HealthTrackerCard(client: client)
				
				// Gym Planner
				GymPlannerCard(client: client)
				
				// Gmail Integration
				GmailCard(client: client)
			}
			.padding()
		}
		.task {
			prefs = try? await client.getLearningPreferences()
			insights = try? await client.getLearningInsights()
			user = try? await client.getUser()
			localEvening = prefs?.preferences.preferEvening ?? false
			localFocus = prefs?.preferences.maxContinuousFocus ?? 60
			localBreaks = user?.autoBreaks ?? true
		}
	}
	
	private func updateLearning() async {
		// Call update endpoint
	}
	
	private func resetLearning() async {
		// Call reset endpoint
	}
}

// MARK: - Learning TSX clone
struct LearningTSXView: View {
    var body: some View {
        GeometryReader { geo in
            let s = scale(for: geo.size.width)
            ScrollView {
                VStack(spacing: 12 * s) {
                // Hero
                VStack(spacing: 12 * s) {
                    HStack {
                        ZStack {
                            LinearGradient(colors: [.blue, .purple], startPoint: .topLeading, endPoint: .bottomTrailing)
                            Image(systemName: "brain.head.profile").foregroundStyle(.white)
                        }
                        .frame(width: 28 * s, height: 28 * s)
                        .clipShape(RoundedRectangle(cornerRadius: 6 * s))
                        Text("Learning Dashboard").font(.system(size: 17 * s))
                        Spacer()
                        HStack(spacing: 8 * s) {
                            Button(action: {}) { HStack { Image(systemName: "arrow.clockwise"); Text("Update") }.font(.system(size: 12 * s)) }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                            Button(action: {}) { Text("Reset").font(.system(size: 12 * s)) }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                        }
                    }
                }
                .padding(.horizontal, 16 * s)
                .padding(.vertical, 10 * s)
                .overlay(Divider(), alignment: .bottom)
                
                VStack(spacing: 12 * s) {
                    // Stats Overview
                    HStack(spacing: 12 * s) {
                        StatCard(icon: "checkmark.circle", color: .green, label: "Events Tracked", value: "142").scaleEffect(s)
                        StatCard(icon: "chart.line.uptrend.xyaxis", color: .blue, label: "Days Active", value: "28").scaleEffect(s)
                    }
                    
                    // Weekday Success
                    VStack(alignment: .leading, spacing: 10 * s) {
                        Text("Weekday Success").font(.system(size: 13 * s))
                        VStack(spacing: 8 * s) {
                            ForEach([("Mon",85),("Tue",92),("Wed",78),("Thu",88),("Fri",95),("Sat",70),("Sun",65)], id: \.0) { d, p in
                                HStack(spacing: 8 * s) {
                                    Text(d).font(.system(size: 11 * s)).foregroundStyle(.secondary).frame(width: 28 * s, alignment: .leading)
                                    ProgressView(value: Double(p) / 100.0).frame(maxWidth: .infinity)
                                    Text("\(p)%").font(.system(size: 11 * s)).frame(width: 28 * s, alignment: .trailing)
                                }
                            }
                        }
                    }
                    .padding(12 * s)
                    .background(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator)))
                    
                    // Best Time Windows
                    VStack(alignment: .leading, spacing: 10 * s) {
                        Text("Best Time Windows").font(.system(size: 13 * s))
                        VStack(spacing: 8 * s) {
                            ForEach([("9:00-11:00 AM",95),("2:00-4:00 PM",88),("7:00-9:00 PM",72)], id: \.0) { t, s in
                                HStack(spacing: 8 * s) {
                                    ZStack { Circle().fill(Color.blue.opacity(0.1)); Text("\(indexOfTime(t))").font(.caption2.weight(.bold)).foregroundStyle(.blue) }.frame(width: 24 * s, height: 24 * s)
                                    Text(t).font(.system(size: 13 * s)).frame(maxWidth: .infinity, alignment: .leading)
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(Color(.systemGray5)).frame(width: 64 * s, height: 6 * s)
                                        Capsule().fill(Color.blue).frame(width: max(0, min(64 * s, CGFloat(s) * 0.64 * 64)), height: 6 * s)
                                    }
                                    Text("\(s)%").font(.system(size: 11 * s)).frame(width: 28 * s, alignment: .trailing)
                                }
                            }
                        }
                    }
                    .padding(12 * s)
                    .background(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator)))
                    
                    // Learned Lengths
                    VStack(alignment: .leading, spacing: 10 * s) {
                        Text("Learned Lengths").font(.system(size: 13 * s))
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 64 * s))], spacing: 10 * s) {
                            ForEach([("15m",42),("30m",38),("45m",24),("1h",31),("2h",18)], id: \.0) { d, c in
                                VStack(spacing: 6 * s) {
                                    ZStack {
                                        RoundedRectangle(cornerRadius: 8 * s).fill(Color(.systemGray6))
                                        VStack(spacing: 4 * s) { Image(systemName: "clock"); Text(d).font(.system(size: 11 * s)) }
                                    }
                                    .frame(height: 48 * s)
                                    Text("\(c)").font(.system(size: 10 * s)).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .padding(12 * s)
                    .background(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator)))
                    
                    // Recent Trends
                    VStack(alignment: .leading, spacing: 10 * s) {
                        Text("Recent Trends").font(.system(size: 13 * s))
                        HStack(spacing: 10 * s) {
                            VStack(spacing: 6 * s) {
                                Text("87%").foregroundStyle(.green).font(.system(size: 15 * s, weight: .semibold))
                                Text("Completed").font(.system(size: 10 * s)).foregroundStyle(.secondary)
                            }.frame(maxWidth: .infinity).padding(8 * s).background(RoundedRectangle(cornerRadius: 8 * s).fill(Color.green.opacity(0.1)))
                            VStack(spacing: 6 * s) {
                                Text("8").foregroundStyle(.orange).font(.system(size: 15 * s, weight: .semibold))
                                Text("Snoozes").font(.system(size: 10 * s)).foregroundStyle(.secondary)
                            }.frame(maxWidth: .infinity).padding(8 * s).background(RoundedRectangle(cornerRadius: 8 * s).fill(Color.orange.opacity(0.1)))
                        }
                    }
                    .padding(12 * s)
                    .background(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator)))
                    
                    // Preferences
                    VStack(alignment: .leading, spacing: 10 * s) {
                        Text("Planner Preferences").font(.system(size: 13 * s))
                        VStack(spacing: 12 * s) {
                            HStack { Text("Evening preference").font(.system(size: 13 * s)); Spacer(); Toggle("", isOn: .constant(false)).labelsHidden() }
                            HStack { Text("Auto breaks").font(.system(size: 13 * s)); Spacer(); Toggle("", isOn: .constant(true)).labelsHidden() }
                            VStack(spacing: 8 * s) {
                                HStack { Text("Max focus (minutes)").font(.system(size: 13 * s)); Spacer() }
                                Slider(value: .constant(0.75), in: 0...1)
                                HStack { Text("30").font(.system(size: 10 * s)).foregroundStyle(.secondary); Spacer(); Text("120").font(.system(size: 10 * s)).foregroundStyle(.secondary) }
                            }
                        }
                    }
                    .padding(12 * s)
                    .background(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator)))
                    
                    // Health Tracker
                    VStack(alignment: .leading, spacing: 10 * s) {
                        HStack { Image(systemName: "drop.fill").foregroundStyle(.blue); Text("Water Tracker").font(.system(size: 13 * s)); Spacer(); Button("+ Add", action: {}).buttonStyle(.bordered).controlSize(.small) }
                        HStack(spacing: 8 * s) { ProgressView(value: 0.625).frame(maxWidth: .infinity); Text("5/8").font(.system(size: 11 * s)).foregroundStyle(.secondary) }
                    }
                    .padding(12 * s)
                    .background(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator)))
                    
                    // Gym Planner
                    VStack(alignment: .leading, spacing: 10 * s) {
                        HStack { Image(systemName: "dumbbell.fill").foregroundStyle(.orange); Text("Gym Planner").font(.system(size: 13 * s)); Spacer(); Text("🔥 7 day streak").font(.system(size: 11 * s)).foregroundStyle(.secondary) }
                        Button("View Plan", action: {}).buttonStyle(.borderedProminent).controlSize(.small)
                    }
                    .padding(12 * s)
                    .background(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator)))
                    
                    // Gmail Integration
                    VStack(alignment: .leading, spacing: 10 * s) {
                        HStack { Image(systemName: "envelope.fill").foregroundStyle(.red); Text("Gmail").font(.system(size: 13 * s)); Spacer(); Text("Connected").font(.system(size: 11 * s)).foregroundStyle(.green) }
                        Button("Sync Now", action: {}).buttonStyle(.bordered)
                    }
                    .padding(12 * s)
                    .background(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator)))
                }
                .padding(.horizontal, 16 * s)
                }
            }
        }
    }
}

private func indexOfTime(_ t: String) -> Int { 
    ["9:00-11:00 AM","2:00-4:00 PM","7:00-9:00 PM"].firstIndex(of: t).map { $0 + 1 } ?? 0 
}

struct WeekdayPatternsCard: View {
	let insights: LearningInsights?
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Image(systemName: "chart.bar.fill").foregroundStyle(.blue)
				Text("Weekday Patterns").font(.system(size: 15, weight: .semibold))
			}
			
			let hasData = insights?.weekdayPatterns.values.contains(where: { $0 > 0 }) ?? false
			
			if hasData {
				ForEach(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], id: \.self) { day in
					let score = insights?.weekdayPatterns[day] ?? 0
					if score > 0 {
						VStack(spacing: 4) {
							HStack {
								Text(day).font(.system(size: 13, weight: .medium))
								Spacer()
								Text("\(Int(score * 100))%").font(.system(size: 12)).foregroundStyle(.secondary)
							}
							ProgressView(value: score).tint(.blue)
						}
					}
				}
			} else {
				VStack(spacing: 8) {
					Image(systemName: "calendar.badge.clock")
						.font(.system(size: 32))
						.foregroundStyle(.secondary)
					Text("No Data Yet")
						.font(.system(size: 14, weight: .medium))
					Text("Complete tasks to see\nyour success patterns")
						.font(.system(size: 12))
						.foregroundStyle(.secondary)
						.multilineTextAlignment(.center)
				}
				.frame(maxWidth: .infinity)
				.padding(.vertical, 20)
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.frame(maxWidth: .infinity)
	}
}

struct BestWindowsCard: View {
	let prefs: LearningPreferencesResponse?
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Image(systemName: "clock.fill").foregroundStyle(.purple)
				Text("Best Times").font(.system(size: 15, weight: .semibold))
			}
			
			let windows = prefs?.stats.topWindows.prefix(3) ?? []
			
			if !windows.isEmpty {
				ForEach(Array(windows.enumerated()), id: \.offset) { idx, window in
					HStack(spacing: 10) {
						ZStack {
							Circle().fill(idx == 0 ? Color.purple : Color(.systemGray5))
							Text("\(idx+1)")
								.font(.system(size: 12, weight: .bold))
								.foregroundStyle(idx == 0 ? .white : .secondary)
						}
						.frame(width: 28, height: 28)
						
						VStack(alignment: .leading, spacing: 2) {
							Text("\(window.weekday)")
								.font(.system(size: 13, weight: .medium))
							Text(formatHour(window.hour))
								.font(.system(size: 11))
								.foregroundStyle(.secondary)
						}
						
						Spacer()
						
						Text("\(Int(window.score * 100))%")
							.font(.system(size: 14, weight: .semibold))
							.foregroundStyle(idx == 0 ? .purple : .secondary)
					}
					.padding(10)
					.background(idx == 0 ? Color.purple.opacity(0.08) : Color(.tertiarySystemBackground))
					.clipShape(RoundedRectangle(cornerRadius: 10))
				}
			} else {
				VStack(spacing: 8) {
					Image(systemName: "clock.arrow.circlepath")
						.font(.system(size: 32))
						.foregroundStyle(.secondary)
					Text("No Data Yet")
						.font(.system(size: 14, weight: .medium))
					Text("Track your productivity\nto discover peak times")
						.font(.system(size: 12))
						.foregroundStyle(.secondary)
						.multilineTextAlignment(.center)
				}
				.frame(maxWidth: .infinity)
				.padding(.vertical, 20)
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.frame(maxWidth: .infinity)
	}
	
	private func formatHour(_ hour: Int) -> String {
		let h = hour % 12
		let displayHour = h == 0 ? 12 : h
		let ampm = hour < 12 ? "AM" : "PM"
		return "\(displayHour):00 \(ampm)"
	}
}

struct LearnedLengthsCard: View {
	let prefs: LearningPreferencesResponse?
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Image(systemName: "chart.line.uptrend.xyaxis").foregroundStyle(.blue)
				Text("Learned Session Lengths").font(.subheadline.weight(.semibold))
			}
			
			LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 12) {
				ForEach(Array(prefs?.stats.learnedLengths ?? [:]).sorted(by: { $0.key < $1.key }), id: \.key) { type, duration in
					VStack(spacing: 4) {
						Text(type.capitalized)
							.font(.caption)
							.foregroundStyle(.secondary)
						Text("\(Int(duration))")
							.font(.title3.weight(.bold))
						Text("minutes")
							.font(.caption2)
							.foregroundStyle(.secondary)
					}
					.padding(12)
					.background(Color(.tertiarySystemBackground))
					.clipShape(RoundedRectangle(cornerRadius: 8))
				}
			}
			
			if prefs?.stats.learnedLengths.isEmpty ?? true {
				Text("No session data yet. Complete tasks to learn optimal durations.")
					.font(.caption)
					.foregroundStyle(.secondary)
					.frame(maxWidth: .infinity)
					.padding()
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
	}
}

struct RecentTrendsCard: View {
	let insights: LearningInsights?
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			Text("Recent Trends (Last 7 Days)").font(.subheadline.weight(.semibold))
			
			VStack(spacing: 8) {
				HStack {
					Text("Completion Rate").font(.caption).foregroundStyle(.secondary)
					Spacer()
					Text("\(Int((insights?.recentTrends.completionRate ?? 0) * 100))%")
						.font(.title3.weight(.bold))
						.foregroundStyle(.blue)
				}
				.padding(12)
				.background(Color(.tertiarySystemBackground))
				.clipShape(RoundedRectangle(cornerRadius: 8))
				
				HStack {
					Text("Avg Snoozes/Day").font(.caption).foregroundStyle(.secondary)
					Spacer()
                    Text(String(format: "%.1f", insights?.recentTrends.avgSnoozes ?? 0.0))
						.font(.title3.weight(.bold))
						.foregroundStyle(.orange)
				}
				.padding(12)
				.background(Color(.tertiarySystemBackground))
				.clipShape(RoundedRectangle(cornerRadius: 8))
				
				HStack {
					Text("Avg Skips/Day").font(.caption).foregroundStyle(.secondary)
					Spacer()
                    Text(String(format: "%.1f", insights?.recentTrends.avgSkips ?? 0.0))
						.font(.title3.weight(.bold))
						.foregroundStyle(.red)
				}
				.padding(12)
				.background(Color(.tertiarySystemBackground))
				.clipShape(RoundedRectangle(cornerRadius: 8))
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.frame(maxWidth: .infinity)
	}
}

struct TotalStatsCard: View {
	let prefs: LearningPreferencesResponse?
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			Text("Total Statistics").font(.subheadline.weight(.semibold))
			
			VStack(spacing: 8) {
				HStack {
					Text("Days Tracked").font(.caption).foregroundStyle(.secondary)
					Spacer()
					Text("\(prefs?.stats.daysTracked ?? 0)")
						.font(.title3.weight(.bold))
						.foregroundStyle(.purple)
				}
				.padding(12)
				.background(Color(.tertiarySystemBackground))
				.clipShape(RoundedRectangle(cornerRadius: 8))
				
				HStack {
					Text("Total Events Logged").font(.caption).foregroundStyle(.secondary)
					Spacer()
					Text("\(prefs?.stats.totalEvents ?? 0)")
						.font(.title3.weight(.bold))
						.foregroundStyle(.purple)
				}
				.padding(12)
				.background(Color(.tertiarySystemBackground))
				.clipShape(RoundedRectangle(cornerRadius: 8))
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.frame(maxWidth: .infinity)
	}
}

struct PreferencesCard: View {
	@Binding var localEvening: Bool
	@Binding var localFocus: Int
	@Binding var localBreaks: Bool
	let client: APIClient
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			Text("Learning Preferences").font(.subheadline.weight(.semibold))
			
			// Prefer Evening Toggle
			HStack {
				VStack(alignment: .leading, spacing: 4) {
					Text("Prefer Evening Slots").font(.caption.weight(.medium))
					Text("Schedule tasks in the evening (6 PM - 9 PM) when possible")
						.font(.caption2)
						.foregroundStyle(.secondary)
				}
				Spacer()
				Toggle("", isOn: $localEvening)
					.labelsHidden()
					.onChange(of: localEvening) { _, val in
						Task {
							_ = try? await client.updateLearningPreferences(
								.init(preferEvening: val, maxContinuousFocus: nil, pinnedWindows: nil, bannedWindows: nil)
							)
						}
					}
			}
			.padding(12)
			.background(Color(.tertiarySystemBackground))
			.clipShape(RoundedRectangle(cornerRadius: 8))
			
			// Max Focus Slider
			VStack(alignment: .leading, spacing: 8) {
				HStack {
					Text("Max Continuous Focus Time").font(.caption.weight(.medium))
					Spacer()
					Text("\(localFocus) min").font(.caption.weight(.bold)).foregroundStyle(.blue)
				}
				Text("Maximum duration for a single focus session before suggesting a break")
					.font(.caption2)
					.foregroundStyle(.secondary)
				Slider(value: Binding(
					get: { Double(localFocus) },
					set: { localFocus = Int($0) }
				), in: 30...120, step: 15)
				.onChange(of: localFocus) { old, new in
					if old != new {
						Task {
							try? await Task.sleep(for: .seconds(0.5))
							_ = try? await client.updateLearningPreferences(
								.init(preferEvening: nil, maxContinuousFocus: new, pinnedWindows: nil, bannedWindows: nil)
							)
						}
					}
				}
				HStack {
					Text("30 min").font(.caption2).foregroundStyle(.secondary)
					Spacer()
					Text("120 min").font(.caption2).foregroundStyle(.secondary)
				}
			}
			.padding(12)
			.background(Color(.tertiarySystemBackground))
			.clipShape(RoundedRectangle(cornerRadius: 8))
			
			// Auto Breaks Toggle
			HStack {
				VStack(alignment: .leading, spacing: 4) {
					Text("Automatic Micro-Breaks").font(.caption.weight(.medium))
					Text("Automatically insert 5-10 minute breaks before heavy tasks and near bedtime")
						.font(.caption2)
						.foregroundStyle(.secondary)
				}
				Spacer()
				Toggle("", isOn: $localBreaks)
					.labelsHidden()
					.onChange(of: localBreaks) { _, val in
						Task { _ = try? await client.setAutoBreaks(val) }
					}
			}
			.padding(12)
			.background(Color(.tertiarySystemBackground))
			.clipShape(RoundedRectangle(cornerRadius: 8))
			
			// Recompute Breaks
			VStack(alignment: .leading, spacing: 8) {
				Text("Break Optimizer").font(.caption.weight(.medium))
				Text("Manually recalculate and insert optimal breaks into your schedule")
					.font(.caption2)
					.foregroundStyle(.secondary)
				Button(action: { Task { _ = try? await client.recomputeBreaks() } }) {
					HStack {
						Image(systemName: "cup.and.saucer.fill")
						Text("Recompute Breaks")
					}
					.font(.caption)
					.frame(maxWidth: .infinity)
				}
				.buttonStyle(.bordered)
				.controlSize(.small)
			}
			.padding(12)
			.background(Color(.tertiarySystemBackground))
			.clipShape(RoundedRectangle(cornerRadius: 8))
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
	}
}

struct HealthTrackerCard: View {
	let client: APIClient
	@State private var rollup: DailyRollupModel?
	@State private var user: UserProfile?
	@State private var showGoalDialog = false
	@State private var goalInput = ""
	@State private var customWater = ""
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Image(systemName: "drop.fill").foregroundStyle(.blue)
				Text("Hydration Tracker").font(.subheadline.weight(.semibold))
			}
			
			let waterGoal = user?.waterGoalMl ?? 0
			let currentWater = rollup?.waterMl ?? 0
			let progress = waterGoal > 0 ? min(Double(currentWater) / Double(waterGoal), 1.0) : 0
			
			if waterGoal > 0 {
				VStack(spacing: 8) {
					HStack {
						Text("\(currentWater) ml").font(.caption)
						Spacer()
						Text("\(waterGoal) ml").font(.caption)
					}
					ProgressView(value: progress).tint(.blue)
					Text("\(Int(progress * 100))% of daily goal")
						.font(.caption2)
						.foregroundStyle(.secondary)
						.frame(maxWidth: .infinity)
					
					Text("Quick Log").font(.caption.weight(.medium))
					HStack(spacing: 8) {
						Button("+250ml") {
							Task {
								_ = try? await client.ingestHealth(waterMl: 250)
								rollup = try? await client.getDailyRollup()
							}
						}
						.font(.caption)
						.buttonStyle(.bordered)
						.controlSize(.small)
						
						Button("+500ml") {
							Task {
								_ = try? await client.ingestHealth(waterMl: 500)
								rollup = try? await client.getDailyRollup()
							}
						}
						.font(.caption)
						.buttonStyle(.bordered)
						.controlSize(.small)
						
						HStack(spacing: 4) {
							TextField("Custom ml", text: $customWater)
								.textFieldStyle(.roundedBorder)
								.keyboardType(.numberPad)
								.frame(width: 80)
							Button("Log") {
								if let ml = Int(customWater), ml > 0 {
									Task {
										_ = try? await client.ingestHealth(waterMl: ml)
										rollup = try? await client.getDailyRollup()
										customWater = ""
									}
								}
							}
							.font(.caption)
							.buttonStyle(.bordered)
							.controlSize(.small)
						}
					}
				}
			} else {
				Text("Set a daily water goal to start tracking your hydration.")
					.font(.caption)
					.foregroundStyle(.secondary)
			}
			
			Button(action: { showGoalDialog = true }) {
				HStack {
					Image(systemName: "target")
					Text(waterGoal > 0 ? "Update Water Goal" : "Set Water Goal")
				}
				.font(.caption)
				.frame(maxWidth: .infinity)
			}
			.buttonStyle(.bordered)
			.controlSize(.small)
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.task {
			rollup = try? await client.getDailyRollup()
			user = try? await client.getUser()
		}
		.sheet(isPresented: $showGoalDialog) {
			NavigationStack {
				Form {
					Section {
						TextField("Water Goal (ml)", text: $goalInput)
							.keyboardType(.numberPad)
						Text("Recommended: 2000-3000 ml per day")
							.font(.caption2)
							.foregroundStyle(.secondary)
					}
				}
				.navigationTitle("Set Water Goal")
				.navigationBarTitleDisplayMode(.inline)
				.toolbar {
					ToolbarItem(placement: .cancellationAction) {
						Button("Cancel") { showGoalDialog = false }
					}
					ToolbarItem(placement: .confirmationAction) {
						Button("Save") {
							if let goal = Int(goalInput), goal > 0 {
								Task {
									_ = try? await client.setWaterGoal(goal)
									user = try? await client.getUser()
									showGoalDialog = false
									goalInput = ""
								}
							}
						}
					}
				}
			}
		}
	}
}

struct GymPlannerCard: View {
	let client: APIClient
	@State private var streak: StreakStatus?
	@State private var prefs: WorkoutPreferences?
	@State private var workouts: [Item] = []
	@State private var showPrefsDialog = false
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			// Streak Status
			HStack {
				Image(systemName: "flame.fill").foregroundStyle(.orange)
				Text("Workout Streak").font(.subheadline.weight(.semibold))
			}
			
			if let s = streak, s.streakDays > 0 {
				HStack(spacing: 8) {
					Text("\(s.streakDays)").font(.title.weight(.bold))
					Text("days streak").font(.caption).foregroundStyle(.secondary)
					if s.protected {
						Text("🔥 Protected")
							.font(.caption2)
							.padding(.horizontal, 6)
							.padding(.vertical, 2)
							.background(Color.orange.opacity(0.2))
							.clipShape(Capsule())
					}
				}
				if let lastWorkout = s.lastWorkout {
					Text("Last workout: \(formatDate(lastWorkout))")
						.font(.caption2)
						.foregroundStyle(.secondary)
				}
			} else {
				Text("Start a workout streak by completing workouts this week!")
					.font(.caption)
					.foregroundStyle(.secondary)
			}
			
			Divider()
			
			// Preferences
			HStack {
				Image(systemName: "gearshape").foregroundStyle(.blue)
				Text("Workout Preferences").font(.subheadline.weight(.semibold))
				Spacer()
				Button("Edit") { showPrefsDialog = true }
					.font(.caption)
					.buttonStyle(.bordered)
					.controlSize(.small)
			}
			
			if let p = prefs {
				VStack(spacing: 6) {
					HStack {
						Text("Workouts per week:").font(.caption).foregroundStyle(.secondary)
						Spacer()
						Text("\(p.perWeek)").font(.caption.weight(.medium))
					}
					HStack {
						Text("Duration:").font(.caption).foregroundStyle(.secondary)
						Spacer()
						Text("\(p.defaultDurationMin) min").font(.caption.weight(.medium))
					}
				}
			}
			
			Divider()
			
			// Plan Button
			Button(action: {
				Task {
					if let result = try? await client.planWorkouts() {
						workouts = result.workouts
						streak = try? await client.getStreakStatus()
					}
				}
			}) {
				HStack {
					Image(systemName: "calendar.badge.plus")
					Text("Plan This Week")
				}
				.font(.caption)
				.frame(maxWidth: .infinity)
			}
			.buttonStyle(.borderedProminent)
			.controlSize(.small)
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.task {
			streak = try? await client.getStreakStatus()
			if let r = try? await client.getWorkoutPrefs() {
				prefs = r.preferences
			}
		}
	}
	
	private func formatDate(_ iso: String) -> String {
		guard let date = ISO8601DateFormatter().date(from: iso) else { return "" }
		let formatter = DateFormatter()
		formatter.dateFormat = "MMM d, yyyy"
		return formatter.string(from: date)
	}
}

struct GmailCard: View {
	let client: APIClient
	@State private var status: GmailStatus?
	@State private var syncing = false
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Image(systemName: "envelope.fill").foregroundStyle(.blue)
				Text("Gmail Integration").font(.subheadline.weight(.semibold))
			}
			
			HStack {
				Text("Connection Status:").font(.caption).foregroundStyle(.secondary)
				Spacer()
				HStack(spacing: 4) {
					Image(systemName: status?.connected == true ? "checkmark.circle.fill" : "xmark.circle.fill")
						.foregroundStyle(status?.connected == true ? .green : .red)
					Text(status?.connected == true ? "Connected" : "Not Connected")
						.font(.caption.weight(.medium))
						.foregroundStyle(status?.connected == true ? .green : .red)
				}
				.padding(.horizontal, 8)
				.padding(.vertical, 4)
				.background(status?.connected == true ? Color.green.opacity(0.1) : Color.red.opacity(0.1))
				.clipShape(Capsule())
			}
			
			if status?.connected == true {
				if let email = status?.emailAddress {
					HStack {
						Text("Email:").font(.caption).foregroundStyle(.secondary)
						Spacer()
						Text(email).font(.caption.weight(.medium))
					}
				}
				
				if let lastSync = status?.lastSyncAt {
					HStack {
						Text("Last Sync:").font(.caption).foregroundStyle(.secondary)
						Spacer()
						Text(formatRelativeTime(lastSync)).font(.caption)
					}
				}
				
				Button(action: {
					Task {
						syncing = true
						_ = try? await client.syncGmail()
						status = try? await client.getGmailStatus()
						syncing = false
					}
				}) {
					HStack {
						Image(systemName: "arrow.clockwise")
							.rotationEffect(.degrees(syncing ? 360 : 0))
							.animation(syncing ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: syncing)
						Text(syncing ? "Syncing..." : "Sync Gmail")
					}
					.font(.caption)
					.frame(maxWidth: .infinity)
				}
				.buttonStyle(.borderedProminent)
				.controlSize(.small)
				.disabled(syncing)
			} else {
				Text("Gmail is not connected. Please connect your Gmail account to enable syncing.")
					.font(.caption)
					.foregroundStyle(.secondary)
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.task {
			status = try? await client.getGmailStatus()
		}
	}
	
	private func formatRelativeTime(_ iso: String) -> String {
		guard let date = ISO8601DateFormatter().date(from: iso) else { return "" }
		let formatter = RelativeDateTimeFormatter()
		formatter.unitsStyle = .short
		return formatter.localizedString(for: date, relativeTo: Date())
	}
}

// MARK: - Insights View (matching web weekly-reflection.tsx)
struct InsightsViewFull: View {
	let client: APIClient
	@State private var summary: WeeklySummary?
	@State private var recent: [WeeklySummary] = []
	@State private var generating = false
	
	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 16) {
				// Empty state when no data
				if summary == nil && recent.isEmpty && !generating {
					VStack(spacing: 16) {
						Spacer().frame(height: 80)
						
						ZStack {
							Circle()
								.fill(LinearGradient(colors: [.purple.opacity(0.1), .blue.opacity(0.1)], startPoint: .topLeading, endPoint: .bottomTrailing))
								.frame(width: 80, height: 80)
							Image(systemName: "chart.line.uptrend.xyaxis")
								.font(.system(size: 36))
								.foregroundStyle(.purple)
						}
						
						Text("No Insights Yet")
							.font(.system(size: 24, weight: .bold))
						
						Text("Complete tasks and track your productivity\nto see weekly insights and trends")
							.font(.system(size: 14))
							.foregroundStyle(.secondary)
							.multilineTextAlignment(.center)
							.padding(.horizontal, 32)
						
						Button(action: { Task { await generate() } }) {
							HStack(spacing: 8) {
								Image(systemName: "sparkles")
								Text("Generate Weekly Report")
							}
							.font(.system(size: 15, weight: .medium))
							.padding(.horizontal, 24)
							.padding(.vertical, 12)
						}
						.buttonStyle(.borderedProminent)
						.padding(.top, 8)
						
						Spacer()
					}
					.frame(maxWidth: .infinity)
				}
				
				// Current Week Summary
				if let s = summary {
					VStack(alignment: .leading, spacing: 16) {
						HStack {
							Image(systemName: "calendar").foregroundStyle(.blue)
							Text("Week of \(formatWeekStart(s.weekStart))")
								.font(.title3.weight(.bold))
							Spacer()
							Button(action: { Task { await generate() } }) {
								HStack(spacing: 4) {
									Image(systemName: generating ? "arrow.clockwise" : "sparkles")
										.rotationEffect(.degrees(generating ? 360 : 0))
										.animation(generating ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: generating)
									Text(generating ? "Generating..." : "Generate")
								}
								.font(.caption)
							}
							.buttonStyle(.bordered)
							.controlSize(.small)
							.disabled(generating)
						}
						
						// Stats Grid
						LazyVGrid(columns: [GridItem(.adaptive(minimum: 120))], spacing: 12) {
							StatCard(icon: "checkmark.circle", color: .green, label: "Tasks Done", value: "\(s.tasksDone)")
							StatCard(icon: "xmark.circle", color: .red, label: "Tasks Skipped", value: "\(s.tasksSkipped)")
							StatCard(icon: "clock", color: .orange, label: "Snoozes", value: "\(s.snoozes)")
							if let delay = s.avgStartDelayMin {
								StatCard(icon: "clock.arrow.circlepath", color: .blue, label: "Avg Start Delay", value: "\(delay)m")
							}
                            if let sleep = s.sleepMedianH {
                                StatCard(icon: "moon", color: .indigo, label: "Median Sleep", value: String(format: "%.1fh", sleep))
							}
							if let active = s.activeMin {
								StatCard(icon: "figure.walk", color: .purple, label: "Active Time", value: "\(active / 60)h")
							}
						}
						
						// Completion Rate
						let rate = completionRate(s)
						VStack(spacing: 8) {
							HStack {
								Text("Completion Rate").font(.caption.weight(.medium))
								Spacer()
								Text("\(rate)%").font(.caption).foregroundStyle(.secondary)
							}
							ProgressView(value: Double(rate) / 100.0).tint(.blue)
						}
						
						// AI Insights
						if let notes = s.notes {
							Divider()
							VStack(alignment: .leading, spacing: 8) {
								HStack {
									Image(systemName: "sparkles").foregroundStyle(.blue)
									Text("AI Insights & Tweaks").font(.subheadline.weight(.semibold))
								}
								Text(notes)
									.font(.caption)
									.foregroundStyle(.secondary)
									.fixedSize(horizontal: false, vertical: true)
							}
						}
					}
					.padding()
					.background(Color(.secondarySystemBackground))
					.clipShape(RoundedRectangle(cornerRadius: 12))
				}
				
				// Recent Weeks
				if !recent.isEmpty {
					VStack(alignment: .leading, spacing: 12) {
						Text("Recent Weeks").font(.headline)
						Text("Your productivity trends over time")
							.font(.caption)
							.foregroundStyle(.secondary)
						
						ForEach(Array(recent.enumerated()), id: \.offset) { idx, r in
							Button(action: {}) {
								HStack {
									VStack(alignment: .leading, spacing: 4) {
										Text(formatWeekStart(r.weekStart))
											.font(.subheadline.weight(.medium))
										HStack(spacing: 12) {
											Text("✓ \(r.tasksDone)").font(.caption2)
											Text("✗ \(r.tasksSkipped)").font(.caption2)
											Text("⏰ \(r.snoozes)").font(.caption2)
										}
										.foregroundStyle(.secondary)
									}
									Spacer()
									let rate = completionRate(r)
									Text("\(rate)%")
										.font(.caption.weight(.bold))
										.padding(.horizontal, 8)
										.padding(.vertical, 4)
										.background(rate >= 70 ? Color.blue.opacity(0.1) : Color.gray.opacity(0.1))
										.foregroundStyle(rate >= 70 ? .blue : .secondary)
										.clipShape(Capsule())
								}
								.padding(12)
								.background(Color(.secondarySystemBackground))
								.clipShape(RoundedRectangle(cornerRadius: 10))
							}
							.buttonStyle(.plain)
						}
					}
					.padding()
					.background(Color(.secondarySystemBackground))
					.clipShape(RoundedRectangle(cornerRadius: 12))
				}
			}
			.padding()
		}
		.task {
			summary = try? await client.getWeeklySummary(weekStartISO: nil)
			recent = (try? await client.getRecentSummaries()) ?? []
		}
	}
	
	private func completionRate(_ s: WeeklySummary) -> Int {
		let total = s.tasksDone + s.tasksSkipped
		return total > 0 ? Int(Double(s.tasksDone) / Double(total) * 100) : 0
	}
	
	private func formatWeekStart(_ iso: String) -> String {
		guard let date = ISO8601DateFormatter().date(from: iso) else { return iso }
		let formatter = DateFormatter()
		formatter.dateFormat = "MMM d, yyyy"
		return formatter.string(from: date)
	}
	
	private func generate() async {
		generating = true
		_ = try? await client.generateWeekly(weekStartISO: nil)
		summary = try? await client.getWeeklySummary(weekStartISO: nil)
		recent = (try? await client.getRecentSummaries()) ?? []
		generating = false
	}
}

// MARK: - Insights TSX clone
struct InsightsTSXView: View {
    var body: some View {
        GeometryReader { geo in
            let s = scale(for: geo.size.width)
            ScrollView {
                VStack(spacing: 12 * s) {
                // Header
                HStack {
                    Text("Weekly Reflection").font(.system(size: 17 * s))
                    Spacer()
                    Button(action: {}) { HStack(spacing: 4 * s) { Image(systemName: "sparkles"); Text("Generate") }.font(.system(size: 12 * s)) }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                }
                .padding(.horizontal, 16 * s)
                .padding(.vertical, 10 * s)
                .overlay(Divider(), alignment: .bottom)

                VStack(spacing: 12 * s) {
                    // Current Week Summary
                    VStack(alignment: .leading, spacing: 12 * s) {
                        HStack {
                            Text("This Week").font(.system(size: 15 * s))
                            Spacer()
                            Text("Oct 6 - Oct 12").font(.system(size: 11 * s)).foregroundStyle(.secondary)
                        }
                        // Stats Grid
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 90 * s))], spacing: 8 * s) {
                            StatTile(value: "42", label: "Done").scaleEffect(s)
                            StatTile(value: "3", label: "Skipped").scaleEffect(s)
                            StatTile(value: "8", label: "Snoozes").scaleEffect(s)
                            StatTile(value: "12m", label: "Avg Delay").scaleEffect(s)
                            StatTile(value: "7.5h", label: "Sleep").scaleEffect(s)
                            StatTile(value: "8.2h", label: "Active").scaleEffect(s)
                        }
                        // Completion Rate
                        VStack(spacing: 8 * s) {
                            HStack { Text("Completion Rate").font(.system(size: 13 * s)); Spacer(); Text("87%") }
                            ProgressView(value: 0.87)
                        }
                        // AI Insights
                        VStack(alignment: .leading, spacing: 8 * s) {
                            HStack(spacing: 6 * s) { Image(systemName: "sparkles").foregroundStyle(.blue); Text("AI Insights").font(.system(size: 13 * s)) }
                            Text("This week you showed strong consistency with morning deep work sessions. Your completion rate improved by 12% compared to last week. Consider scheduling more breaks in the afternoon when your snooze rate tends to increase.")
                                .font(.system(size: 13 * s))
                                .foregroundStyle(.secondary)
                        }
                        .padding(10 * s)
                        .background(RoundedRectangle(cornerRadius: 10 * s).fill(Color.blue.opacity(0.06)).overlay(RoundedRectangle(cornerRadius: 10 * s).stroke(Color.blue.opacity(0.2))) )
                    }
                    .padding(12 * s)
                    .background(RoundedRectangle(cornerRadius: 12 * s).stroke(Color(.separator)))

                    // Recent Weeks
                    VStack(alignment: .leading, spacing: 10 * s) {
                        Text("Recent Weeks").font(.system(size: 15 * s))
                        VStack(spacing: 8 * s) {
                            ForEach([
                                ("Oct 29 - Nov 4", 38, 82, Color.green),
                                ("Oct 22 - Oct 28", 35, 75, Color.yellow),
                                ("Oct 15 - Oct 21", 40, 85, Color.green),
                                ("Oct 8 - Oct 14", 32, 70, Color.orange)
                            ], id: \.0) { w, done, comp, color in
                                Button(action: {}) {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 6 * s) {
                                            Text(w).font(.system(size: 13 * s))
                                            VStack(spacing: 6 * s) {
                                                HStack { Text("Completed").font(.system(size: 11 * s)).foregroundStyle(.secondary); Spacer(); Text("\(done) tasks").font(.system(size: 11 * s)) }
                                                ProgressView(value: Double(comp)/100.0)
                                            }
                                        }
                                        Spacer()
                                        ZStack { Circle().fill(color); Text("\(comp)%").font(.system(size: 13 * s)).foregroundStyle(.white) }.frame(width: 44 * s, height: 44 * s)
                                    }
                                    .padding(12 * s)
                                    .background(RoundedRectangle(cornerRadius: 10 * s).fill(Color(.secondarySystemBackground)))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(12 * s)
                    .background(RoundedRectangle(cornerRadius: 12 * s).stroke(Color(.separator)))

                    // All-Time Stats
                    VStack(alignment: .leading, spacing: 10 * s) {
                        Text("All-Time Stats").font(.system(size: 15 * s))
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120 * s))], spacing: 8 * s) {
                            StatTile(value: "187", label: "Total Tasks").scaleEffect(s)
                            StatTile(value: "83%", label: "Avg Rate").scaleEffect(s)
                            StatTile(value: "28", label: "Days").scaleEffect(s)
                            StatTile(value: "6.7", label: "Tasks/Day").scaleEffect(s)
                        }
                    }
                    .padding(12 * s)
                    .background(RoundedRectangle(cornerRadius: 12 * s).stroke(Color(.separator)))
                }
                .padding(.horizontal, 16 * s)
                }
            }
        }
    }
}

private struct StatTile: View {
    let value: String
    let label: String
    var body: some View {
        VStack(spacing: 6) {
            Text(value).font(.system(size: 17))
            Text(label).font(.system(size: 11)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(.systemGray6)))
	}
}

struct StatCard: View {
	let icon: String
	let color: Color
	let label: String
	let value: String
	
	var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 10).fill(color))
            Text(value)
                .font(.system(size: 20, weight: .bold))
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
	}
}

// MARK: - Tasks TSX clone
struct TasksTSXView: View {
    let client: APIClient
    @State private var activeTab: String = "today"
    @State private var filters: Set<String> = []
    @State private var tasks: [Item] = []
    private let filterOptions = ["Priority", "Due", "Type"]
    
    var body: some View {
        GeometryReader { geo in
            let s = scale(for: geo.size.width)
            VStack(spacing: 0) {
                // Tabs header
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        tabButton("today", label: "Today", s)
                        tabButton("week", label: "Week", s)
                        tabButton("all", label: "All", s)
                    }
                    .overlay(Divider(), alignment: .bottom)
                    
                    // Filters chips
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8 * s) {
                            ForEach(filterOptions, id: \.self) { f in
                                Button(action: { toggle(f) }) {
                                    Text(f)
                                        .font(.system(size: 12 * s))
                                        .padding(.horizontal, 10 * s)
                                        .padding(.vertical, 6 * s)
                                        .background((filters.contains(f) ? Color.blue : Color(.secondarySystemBackground)))
                                        .foregroundStyle(filters.contains(f) ? .white : .primary)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 12 * s)
                        .padding(.vertical, 8 * s)
                    }
                    .overlay(Divider(), alignment: .bottom)
                }
                
                // Content
                ScrollView {
                    VStack(spacing: 0) {
                        switch activeTab {
                        case "today": TodaySection(tasks: tasks, scale: s)
                        case "week": TasksFlatList(items: tasks, scale: s)
                        case "all": TasksFlatList(items: tasks, scale: s)
                        default: EmptyView()
                        }
                    }
                    .padding(.vertical, 8 * s)
                }
            }
            .task { await load() }
			.onReceive(NotificationCenter.default.publisher(for: .itemsCreated)) { _ in
				Task { await load() }
			}
        }
    }
    @ViewBuilder private func tabButton(_ value: String, label: String, _ s: CGFloat) -> some View {
        Button(action: { activeTab = value }) {
            Text(label)
                .font(.system(size: 14 * s, weight: .medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10 * s)
                .background(activeTab == value ? Color(.systemGray6) : Color.clear)
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { activeTab == value ? Rectangle().fill(Color.blue).frame(height: 2 * s) : nil }
    }
    private func toggle(_ f: String) { if filters.contains(f) { filters.remove(f) } else { filters.insert(f) } }
    private func load() async { tasks = (try? await client.getTasks().today) ?? [] }
}

private struct TodaySection: View {
    let tasks: [Item]
    var scale: CGFloat
    var body: some View {
        let now = tasks.filter { !$0.done && $0.start != nil }
        let next = tasks.filter { !$0.done && $0.start == nil && $0.deadline != nil }
        let later = tasks.filter { !$0.done && $0.start == nil && $0.deadline == nil }
        VStack(spacing: 0) {
            if !now.isEmpty { section(title: "Now", list: now, icon: "clock.fill", color: .red) }
            if !next.isEmpty { section(title: "Next", list: next, icon: "arrow.right.circle.fill", color: .orange) }
            if !later.isEmpty { section(title: "Later", list: later, icon: "calendar", color: .blue) }
            if now.isEmpty && next.isEmpty && later.isEmpty {
                VStack(spacing: 16 * scale) {
                    Spacer().frame(height: 60 * scale)
                    
                    ZStack {
                        Circle()
                            .fill(LinearGradient(colors: [.green.opacity(0.1), .blue.opacity(0.1)], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .frame(width: 80 * scale, height: 80 * scale)
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 40 * scale))
                            .foregroundStyle(.green)
                    }
                    
                    Text("All Done!")
                        .font(.system(size: 24 * scale, weight: .bold))
                    
                    Text("You've completed all your tasks for today.\nTake a well-deserved break! 🎉")
                        .font(.system(size: 14 * scale))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32 * scale)
                    
                    Spacer()
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 16 * scale)
            }
        }
    }
    @ViewBuilder private func section(title: String, list: [Item], icon: String, color: Color) -> some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 12 * scale))
                    .foregroundStyle(color)
                Text(title)
                    .font(.system(size: 14 * scale, weight: .semibold))
                Spacer()
                Text("\(list.count)")
                    .font(.system(size: 12 * scale, weight: .medium))
                    .padding(.horizontal, 8 * scale)
                    .padding(.vertical, 4 * scale)
                    .background(color.opacity(0.15))
                    .foregroundStyle(color)
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 16 * scale)
            .padding(.vertical, 12 * scale)
            .background(Color(.systemGray6))
            ForEach(list) { item in TaskRowTSX(item: item, scale: scale) }
            Divider()
        }
    }
}

private struct TasksFlatList: View {
    let items: [Item]
    var scale: CGFloat
    var body: some View { VStack(spacing: 8 * scale) { ForEach(items) { i in TaskRowTSX(item: i, scale: scale) } }.padding(.horizontal, 12 * scale) }
}

private struct TaskRowTSX: View {
    let item: Item
    var scale: CGFloat
    var body: some View {
        HStack(spacing: 12 * scale) {
            Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 18 * scale))
                .foregroundStyle(item.done ? .green : .secondary)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title).font(.system(size: 14 * scale, weight: .medium))
                HStack(spacing: 6 * scale) {
                    Chip(text: item.priority == .normal ? "medium" : item.priority.rawValue, color: priorityColor(item.priority))
                    if let d = item.durationMinutes { Chip(text: "\(d)m", color: .blue) }
                    if let due = item.deadline { HStack(spacing: 4 * scale) { Image(systemName: "clock"); Text(formatTime(due)) }.font(.system(size: 11 * scale)).foregroundStyle(.secondary) }
                }
            }
            Spacer()
            Button(action: {}) { Image(systemName: "play.fill") }
                .buttonStyle(.bordered)
                .controlSize(.mini)
            Button(action: {}) { Image(systemName: "ellipsis") }
                .buttonStyle(.plain)
        }
        .padding(12 * scale)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
        .padding(.horizontal, 12 * scale)
    }
    private func priorityColor(_ p: Priority) -> Color { switch p { case .high: return .red; case .normal: return .orange; case .low: return .gray } }
    private func formatTime(_ iso: String) -> String { guard let d = ISO8601DateFormatter().date(from: iso) else { return iso }; let f = DateFormatter(); f.dateFormat = "h:mm a"; f.amSymbol = "AM"; f.pmSymbol = "PM"; return f.string(from: d) }
}

// MARK: - API extension for chat
extension APIClient {
	func sendChatMessage(_ message: String) async throws -> ChatResponse {
		struct Body: Encodable { let message: String; let timezone: String }
		let url = config.baseURL.appendingPathComponent("/api/chat/parse")
		var req = URLRequest(url: url)
		req.httpMethod = "POST"
		req.setValue("application/json", forHTTPHeaderField: "Content-Type")
		req.httpBody = try JSONEncoder().encode(Body(message: message, timezone: config.timezoneProvider()))
		let (data, resp) = try await session.data(for: req)
		guard let http = resp as? HTTPURLResponse else { throw URLError(.badServerResponse) }
		if (200..<300).contains(http.statusCode) == false {
			// Try to decode server error payload for clearer diagnostics
			if let apiErr = try? jsonDecoder.decode(APIError.self, from: data) {
				throw apiErr
			}
			throw URLError(.badServerResponse)
		}
		return try jsonDecoder.decode(ChatResponse.self, from: data)
	}
}

// MARK: - Agent endpoint fallback (tool-calling orchestrator)
struct AgentToolCall: Codable { let id: String?; let name: String? }
struct AgentResponse: Codable { let tools: [AgentToolCall]?; let summary: String? }

extension APIClient {
	func agentRespond(_ message: String) async throws -> AgentResponse {
		struct Body: Encodable { let message: String; let timezone: String }
		let url = config.baseURL.appendingPathComponent("/api/agent/respond")
		var req = URLRequest(url: url)
		req.httpMethod = "POST"
		req.setValue("application/json", forHTTPHeaderField: "Content-Type")
		req.httpBody = try JSONEncoder().encode(Body(message: message, timezone: config.timezoneProvider()))
		let (data, resp) = try await session.data(for: req)
		guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
		return try jsonDecoder.decode(AgentResponse.self, from: data)
	}
}

extension Calendar {
	func startOfWeek(for date: Date) -> Date {
		let comps = dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
		return self.date(from: comps) ?? date
	}
}
