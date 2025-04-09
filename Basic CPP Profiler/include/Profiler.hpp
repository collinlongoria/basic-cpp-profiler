// DLL export
#pragma once

#ifdef _WIN32
	#ifdef PROFILER_EXPORTS
		#define PROFILER_API __declspec(dllexport)
	#else
		#define PROFILER_API __declspec(dllimport)
	#endif
#else
	#define PROFILER_API
#endif

// Warning disable
#ifdef _MSC_VER
#pragma warning(push)
#pragma warning(disable: 4251) // suppress STL DLL interface warnings
#endif

// Actual header
#ifndef PROFILER_HPP
#define PROFILER_HPP

#include <string>
#include <unordered_map>
#include <chrono>
#include <mutex>
#include <vector>

namespace Profiler {

	// The data that needs to get output to JSON - related to functions
	struct FunctionStats {
		uint64_t callCount = 0;
		double totalTimeMs = 0.0;
		std::vector<double> durationMs; // will use later
	};

	// Initialization function - must be called by user at start of the program
	PROFILER_API void BeginSession();
	// End function, must also be called by user, since it will generate and export JSON
	PROFILER_API void EndSession();
	// Given a function, increment the call count of said function (called at the beginning of the function)
	PROFILER_API void IncrementCall(const std::string& functionName);
	// Given a function, add the duration the function spent performing tasks to that function's stats (called at the end of the function)
	PROFILER_API void AddDuration(const std::string& functionName, double durationMs);
	// Returns the singleton of the current profiled data (from all functions)
	PROFILER_API const std::unordered_map<std::string, FunctionStats>& GetAllStats();

	// RAII timer that will record the duration of the function during it's destruction.
	class PROFILER_API ScopeTimer {
	public:
		ScopeTimer(const std::string& functionName);
		~ScopeTimer();
	private:
		std::string m_functionName;
		std::chrono::high_resolution_clock::time_point m_start;
	};
}

// Macro that the user will put at the top of any function they want tracked
#define PROFILE_FUNCTION() Profiler::ScopeTimer __profiler_timer__(__FUNCTION__)

#endif

// Warning undisable
#ifdef _MSC_VER
#pragma warning(pop)
#endif
