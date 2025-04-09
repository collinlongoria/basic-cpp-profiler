#include "Profiler.hpp"

namespace Profiler {
	static std::unordered_map<std::string, FunctionStats> s_stats;
	static std::mutex s_mutex;

	void BeginSession() {
		std::lock_guard<std::mutex> lock(s_mutex);
		s_stats.clear();

		// maybe init JSON here?
	}

	void EndSession() {
		// export to JSON here
	}

	void IncrementCall(const std::string& functionName) {
		std::lock_guard<std::mutex> lock(s_mutex);
		s_stats[functionName].callCount++;
	}

	void AddDuration(const std::string& functionName, double durationMs) {
		std::lock_guard<std::mutex> lock(s_mutex);
		auto& stat = s_stats[functionName];
		stat.totalTimeMs += durationMs;
		stat.durationMs.push_back(durationMs);
	}

	const std::unordered_map<std::string, FunctionStats>& GetAllStats() {
		return s_stats;
	}

	ScopeTimer::ScopeTimer(const std::string& functionName)
		: m_functionName(functionName), m_start(std::chrono::high_resolution_clock::now()) 
	{
		IncrementCall(m_functionName);
	}

	ScopeTimer::~ScopeTimer() {
		auto end = std::chrono::high_resolution_clock::now();
		double duration = std::chrono::duration<double, std::milli>(end - m_start).count();
		AddDuration(m_functionName, duration);
	}
}