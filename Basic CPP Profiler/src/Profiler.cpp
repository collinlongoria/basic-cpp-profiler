#include "Profiler.hpp"

// nlhomann JSON for modern C++
#include "json.hpp"

// windows related headers
#ifdef _WIN32
#include <Windows.h>
#include <Psapi.h>
#endif

namespace Profiler {
	// For thread activity
	struct ThreadSlice {
		uint64_t timestamp;
		std::string label;
	};
	static std::mutex s_threadMutex;
	static std::unordered_map<std::thread::id, std::vector<ThreadSlice>> s_threadTimeline;

	// For heap fragmentation tracking
	static std::mutex s_allocMutex;
	static std::vector<size_t> s_allocSizes;
	static bool s_trackAllocations = false;

	static std::unordered_map<std::string, FunctionStats> s_stats;
	static std::mutex s_mutex;
	static std::string s_outputPath = "profiler_output.json";
	static std::atomic<bool> s_memorySampling = false;
	static std::vector<std::pair<uint64_t, size_t>> s_memoryTimeline;
	static std::thread s_samplerThread;
	static thread_local std::vector<std::string> s_callStack;
	static std::map<std::string, std::unordered_map<std::string, int>> s_callGraph;
	static std::chrono::steady_clock::time_point s_startTime;

	// static helper function for retrieving memory usage (WINDOWS ONLY)
	static size_t GetProcessMemoryUsage() {
#ifdef _WIN32
		PROCESS_MEMORY_COUNTERS pmc;
		if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc))) {
			return static_cast<size_t>(pmc.WorkingSetSize); // in bytes!
		}
		return 0;
#else
		return 0; // No cross platform because this is just a simple school assignment
#endif
	}

	void BeginSession() {
		std::lock_guard<std::mutex> lock(s_mutex);
		s_stats.clear();
		s_startTime = std::chrono::steady_clock::now(); // many things could benefit from this, but I added it later. As such, this is only used sometimes.
	}

	void EndSession() {
		StopMemorySampler();
		// TODO: add anything that needs to be destroyed or shutdown here
		DumpToJSON();
	}

	void IncrementCall(const std::string& functionName) {
		std::lock_guard<std::mutex> lock(s_mutex);
		s_stats[functionName].callCount++;
	}

	void AddDuration(const std::string& functionName, double durationMs) {
		std::lock_guard<std::mutex> lock(s_mutex);
		auto& stat = s_stats[functionName];
		stat.totalTimeMs += durationMs;
		stat.durationsMs.push_back(durationMs);
	}

	const std::unordered_map<std::string, FunctionStats>& GetAllStats() {
		return s_stats;
	}

	void DumpToJSON() {
		std::lock_guard<std::mutex> lock(s_mutex);
		nlohmann::json j;

		// Functions
		for (const auto& [name, stats] : s_stats) {
			j["functions"][name] = {
				{ "callCount", stats.callCount },
				{ "totalTimeMs", stats.totalTimeMs },
				{ "durationsMs", stats.durationsMs }
			};
		}

		// Call graph
		j["callGraph"] = s_callGraph;

		// Memory timeline
		for (const auto& [timestamp, memory] : s_memoryTimeline) {
			j["memoryTimeline"].push_back({ timestamp, memory });
		}

		// Thread timeline
		for (const auto& [threadId, events] : s_threadTimeline) {
			std::string threadName = "Thread_" + std::to_string(std::hash<std::thread::id>{}(threadId));
			for (const auto& entry : events) {
				j["threads"][threadName].push_back({
					{ "timestamp", entry.timestamp },
					{ "label", entry.label }
					});
			}
		}

		// Alloc sizes
		j["allocSizes"] = s_allocSizes;

		// Output
		std::ofstream outFile(s_outputPath);
		if (outFile.is_open()) {
			outFile << j.dump(4);
			outFile.close();
		}
	}

	void SetOutputPath(const std::string& filepath) {
		std::lock_guard<std::mutex> lock(s_mutex);
		s_outputPath = filepath;
	}

	void StartMemorySampler(int intervalMs) {
		if (s_memorySampling) return; // prevent double-start
		s_memorySampling = true;

		// Ensure existing thread is joined before starting a new one
		if (s_samplerThread.joinable()) {
			s_samplerThread.join();
		}

		s_samplerThread = std::thread([intervalMs]() {
			auto start = s_startTime;
			while (s_memorySampling) {
				auto now = std::chrono::steady_clock::now();
				uint64_t timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(now - start).count();
				size_t mem = GetProcessMemoryUsage();

				{
					std::lock_guard<std::mutex> lock(s_mutex);
					s_memoryTimeline.emplace_back(timestamp, mem);
				}

				std::this_thread::sleep_for(std::chrono::milliseconds(intervalMs));
			}
			});
	}

	void StopMemorySampler() {
		s_memorySampling = false;
		if (s_samplerThread.joinable()) {
			s_samplerThread.join();
		}
	}

	void EnterFunction(const std::string& functionName) {
		if (!s_callStack.empty()) {
			std::lock_guard<std::mutex> lock(s_mutex);
			s_callGraph[s_callStack.back()][functionName]++;
		}
		s_callStack.push_back(functionName);
	}

	void ExitFunction() {
		if (!s_callStack.empty()) {
			s_callStack.pop_back();
		}
	}

	void MarkThreadEvent(const std::string& label) {
		auto now = std::chrono::steady_clock::now();
		uint64_t timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(now - s_startTime).count();

		std::lock_guard<std::mutex> lock(s_threadMutex);
		s_threadTimeline[std::this_thread::get_id()].push_back({ timestamp, label });
	}

	void EnableAllocationTracking(bool enable) {
		s_trackAllocations = enable;
	}

	ScopeTimer::ScopeTimer(const std::string& functionName)
		: m_functionName(functionName), m_start(std::chrono::high_resolution_clock::now()) 
	{
		EnterFunction(functionName);
		IncrementCall(m_functionName);
	}

	ScopeTimer::~ScopeTimer() {
		ExitFunction();
		auto end = std::chrono::high_resolution_clock::now();
		double duration = std::chrono::duration<double, std::milli>(end - m_start).count();
		AddDuration(m_functionName, duration);
	}
}

// new and delete overrides
static thread_local bool s_inAllocator = false;
void* operator new(std::size_t size) {
	if (Profiler::s_trackAllocations && !s_inAllocator) {
		s_inAllocator = true;
		{
			std::lock_guard<std::mutex> lock(Profiler::s_allocMutex);
			Profiler::s_allocSizes.push_back(size);
		}
		s_inAllocator = false;
	}
	return malloc(size);
}
void operator delete(void* ptr) noexcept {
	free(ptr);
}