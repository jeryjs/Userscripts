package main

import (
	"archive/zip"
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"os/user"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/eiannone/keyboard"
	"github.com/fatih/color"
	"github.com/olekukonko/tablewriter"
	"github.com/schollz/progressbar/v3"
)

const version = "1.3.1"

// Compiled regex for speed limit validation
var speedLimitRe = regexp.MustCompile(`^\d+(\.\d+)?[kKmMgG]$`)

// Colors
var Clr = struct {
	red, green, yellow, blue, cyan, bold func(...interface{}) string
}{
	color.New(color.FgRed).SprintFunc(),
	color.New(color.FgGreen).SprintFunc(),
	color.New(color.FgYellow).SprintFunc(),
	color.New(color.FgBlue).SprintFunc(),
	color.New(color.FgCyan).SprintFunc(),
	color.New(color.Bold).SprintFunc(),
}

// Types
type Settings struct {
	ParallelDownloads int    `json:"parallel_downloads"`
	Retries           int    `json:"retries"`
	SpeedLimit        string `json:"speed_limit"`
	Timeout           int    `json:"timeout"`
}

type LinkInfo struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// DownloadStatus holds progress/statistics for a download
type DownloadStatus struct {
	LinkInfo
	Output    string
	Progress  float64 // percent
	SizeMB    float64
	Speed     string // e.g. "2.5x"
	Elapsed   time.Duration
	Remaining time.Duration
	Status    string // Queued, Downloading, Paused, Completed, Failed, Skipped
	Err       error
	process   *os.Process
	ctx       context.Context
	cancel    context.CancelFunc
	mu        sync.Mutex
	Duration  time.Duration
}

// Global state
var (
	interrupted = make(chan os.Signal, 1)
)

func init() {
	signal.Notify(interrupted, os.Interrupt, syscall.SIGTERM)
}

// ==== UI Utils ==== //
func withAltScreen(fn func()) {
	fmt.Print("\033[?1049h")
	fn()
	fmt.Print("\033[?1049l")
}

func clearScreen() {
	fmt.Print("\033[2J\033[H")
}

func prompt(msg, def string) string {
	if def != "" {
		fmt.Printf("%s [%s]: ", msg, Clr.blue(def))
	} else {
		fmt.Printf("%s: ", msg)
	}
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Scan()
	if input := strings.TrimSpace(scanner.Text()); input != "" {
		return input
	}
	return def
}

func confirm(msg string, def bool) bool {
	defStr := "y/N"
	if def {
		defStr = "Y/n"
	}
	resp := strings.ToLower(prompt(msg, defStr))
	if resp == "" {
		return def
	}
	return resp == "y" || resp == "yes"
}

func renderTable(title string, headers []string, rows [][]string) {
	fmt.Printf("%s\n\n", Clr.bold(title))
	t := tablewriter.NewWriter(os.Stdout)
	t.SetHeader(headers)
	t.SetAutoWrapText(false)
	t.SetAlignment(tablewriter.ALIGN_CENTER)
	t.SetHeaderAlignment(tablewriter.ALIGN_CENTER)
	for _, row := range rows {
		t.Append(row)
	}
	t.Render()
}

// ==== Settings Management ==== //
func getConfigFile() string {
	var dir string
	if runtime.GOOS == "windows" {
		dir = filepath.Join(os.Getenv("LOCALAPPDATA"), "m3u_downloader")
	} else {
		usr, _ := user.Current()
		dir = filepath.Join(usr.HomeDir, ".config", "m3u_downloader")
	}
	os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "settings.json")
}

func loadSettings() Settings {
	s := Settings{ParallelDownloads: 4, Retries: 3, SpeedLimit: "", Timeout: 30}
	if data, err := os.ReadFile(getConfigFile()); err == nil {
		json.Unmarshal(data, &s)
	}
	return s
}

func saveSettings(s Settings) {
	if data, err := json.MarshalIndent(s, "", "  "); err == nil {
		os.WriteFile(getConfigFile(), data, 0644)
	}
}

func customizeSettings(s Settings) Settings {
	withAltScreen(func() {
		for {
			clearScreen()
			renderTable("Settings Configuration", []string{"No.", "Setting", "Value"}, [][]string{
				{"1", "Parallel Downloads", strconv.Itoa(s.ParallelDownloads)},
				{"2", "Retries", strconv.Itoa(s.Retries)},
				{"3", "Speed Limit", func() string {
					if s.SpeedLimit == "" {
						return "None"
					}
					return s.SpeedLimit
				}()},
				{"4", "Timeout (seconds)", strconv.Itoa(s.Timeout)},
			})

			choices := prompt("\nEnter numbers to change (e.g., 1,3)", "")
			if choices == "" {
				break
			}

			for _, c := range strings.Split(choices, ",") {
				switch strings.TrimSpace(c) {
				case "1":
					if v, err := strconv.Atoi(prompt("Parallel downloads", strconv.Itoa(s.ParallelDownloads))); err == nil && v > 0 && v <= 20 {
						s.ParallelDownloads = v
					}
				case "2":
					if v, err := strconv.Atoi(prompt("Retries", strconv.Itoa(s.Retries))); err == nil && v > 0 && v <= 10 {
						s.Retries = v
					}
				case "3":
					val := prompt("Speed limit (e.g., 500k, 2M)", s.SpeedLimit)
					if val == "" || val == "none" {
						s.SpeedLimit = ""
					} else if speedLimitRe.MatchString(val) {
						s.SpeedLimit = val
					} else {
						fmt.Printf("%s\n", Clr.red("Invalid format!"))
						time.Sleep(time.Second)
					}
				case "4":
					if v, err := strconv.Atoi(prompt("Timeout", strconv.Itoa(s.Timeout))); err == nil && v > 0 {
						s.Timeout = v
					}
				}
			}

			if !confirm("Change more settings?", false) {
				break
			}
		}
	})
	saveSettings(s)
	return s
}

// ==== File Operations ==== //
func parseM3U(file string) ([]LinkInfo, error) {
	f, err := os.Open(file)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var links []LinkInfo
	var name string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "#EXTINF") {
			if parts := strings.SplitN(line, ",", 2); len(parts) == 2 {
				name = strings.TrimSpace(parts[1])
			}
		} else if strings.HasPrefix(line, "http") {
			links = append(links, LinkInfo{Name: name, URL: line})
		}
	}
	return links, nil
}

// sanitize replaces invalid characters in file names
func sanitize(name string) string {
	return regexp.MustCompile(`[\\/:*?"<>|]`).ReplaceAllString(name, "_")
}

func getOutputFile(link LinkInfo, folder string) string {
	name := sanitize(strings.TrimSuffix(link.Name, filepath.Ext(link.Name)))
	ext := ".mp4"
	if !strings.Contains(link.URL, ".m3u8") {
		if e := filepath.Ext(link.URL); e != "" {
			ext = e
		}
	}
	return filepath.Join(folder, name+ext)
}

func checkExisting(links []LinkInfo, folder string) []LinkInfo {
	type existing struct {
		idx      int
		path     string
		size     float64
		duration time.Duration
	}
	var found []existing
	for i, link := range links {
		if out := getOutputFile(link, folder); fileExists(out) {
			if fi, err := os.Stat(out); err == nil {
				// Try to get video duration using ffprobe
				cmd := exec.Command("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out)
				output, err := cmd.Output()
				if err != nil {
					// Not a video or ffprobe failed, skip this file
					continue
				}
				durSec, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
				if err != nil || durSec == 0 {
					continue
				}
				found = append(found, existing{
					i + 1,
					out,
					float64(fi.Size()) / (1024 * 1024),
					time.Duration(durSec * float64(time.Second)).Round(time.Second),
				})
			}
		}
	}

	if len(found) > 0 {
		filesFoundMessage := fmt.Sprintf("%s %s %s:", Clr.red("!"), Clr.cyan(len(found)), Clr.yellow("existing files found"))
		fmt.Print(filesFoundMessage)
		var result []LinkInfo
		withAltScreen(func() {
			rows := make([][]string, len(found))
			for i, f := range found {
				rows[i] = []string{strconv.Itoa(f.idx), filepath.Base(f.path), fmt.Sprintf("%.2f", f.size), f.duration.String()}
			}
			renderTable(filesFoundMessage, []string{"No.", "File", "Size", "Duration"}, rows)
			choices := prompt("Files to overwrite (e.g., 1-3,5)", "")
			overwrite := parseRanges(choices)
			for i, link := range links {
				if _, ok := overwrite[i+1]; ok || !fileExists(getOutputFile(link, folder)) {
					result = append(result, link)
				}
			}
		})
		return result
	}
	return links
}

func parseRanges(s string) map[int]struct{} {
	result := make(map[int]struct{})
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if strings.Contains(part, "-") {
			if ab := strings.SplitN(part, "-", 2); len(ab) == 2 {
				if a, err1 := strconv.Atoi(strings.TrimSpace(ab[0])); err1 == nil {
					if b, err2 := strconv.Atoi(strings.TrimSpace(ab[1])); err2 == nil {
						for i := a; i <= b; i++ {
							result[i] = struct{}{}
						}
					}
				}
			}
		} else if n, err := strconv.Atoi(part); err == nil {
			result[n] = struct{}{}
		}
	}
	return result
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// ==== FFmpeg Management ==== //
func checkFFmpeg() error {
	if _, err := exec.LookPath("ffmpeg"); err == nil {
		return nil
	}
	if !confirm("FFmpeg not found. Download it?", true) {
		return fmt.Errorf("ffmpeg required")
	}
	return downloadFFmpeg()
}

func downloadFFmpeg() error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("auto-download only supported on Windows")
	}

	fmt.Printf("%s\n", Clr.yellow("Downloading FFmpeg..."))
	resp, err := http.Get("https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-4.4.1-essentials_build.zip")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	dir := "./ffmpeg"
	os.MkdirAll(dir, 0755)
	archive := filepath.Join(dir, "ffmpeg.zip")

	file, err := os.Create(archive)
	if err != nil {
		return err
	}
	defer file.Close()

	bar := progressbar.DefaultBytes(resp.ContentLength, "downloading")
	io.Copy(io.MultiWriter(file, bar), resp.Body)

	r, err := zip.OpenReader(archive)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		if strings.Contains(f.Name, "ffmpeg.exe") && !f.FileInfo().IsDir() {
			rc, _ := f.Open()
			outFile, _ := os.Create(filepath.Join(dir, "ffmpeg.exe"))
			io.Copy(outFile, rc)
			rc.Close()
			outFile.Close()
			break
		}
	}

	os.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	fmt.Printf("\n%s\n", Clr.green("FFmpeg installed!"))
	return nil
}

// ==== Download Management ==== //
func runDownloads(links []LinkInfo, folder string, settings Settings) {
	withAltScreen(func() {
		var wg sync.WaitGroup
		paused := false
		activeDownloads := make([]*DownloadStatus, 0, len(links))
		for _, link := range links {
			ctx, cancel := context.WithCancel(context.Background())
			activeDownloads = append(activeDownloads, &DownloadStatus{
				LinkInfo: link,
				Output:   getOutputFile(link, folder),
				Status:   "Queued",
				ctx:      ctx,
				cancel:   cancel,
			})
		}

		if err := keyboard.Open(); err != nil {
			fmt.Printf("failed to open keyboard: %v", err)
			return
		}
		defer keyboard.Close()

		// Dispatcher
		linkChan := make(chan *DownloadStatus, len(links))
		for _, d := range activeDownloads {
			linkChan <- d
		}
		close(linkChan)

		for i := 0; i < settings.ParallelDownloads; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for stat := range linkChan {
					for paused {
						stat.mu.Lock()
						if stat.Status == "Downloading" {
							stat.Status = "Paused"
						}
						stat.mu.Unlock()
						time.Sleep(100 * time.Millisecond)
					}
					downloadFile(stat, settings)
				}
			}()
		}

		// UI and Input loop
		ticker := time.NewTicker(200 * time.Millisecond)
		defer ticker.Stop()
	mainloop:
		for {
			renderDownloadsUI(activeDownloads, paused)

			select {
			case <-ticker.C:
				// continue to process keyboard input
			case <-interrupted:
				break mainloop
			default:
				// non-blocking key check
			}

			char, key, err := keyboard.GetKey()
			if err != nil {
				break mainloop
			}
			if key == keyboard.KeyEsc || key == keyboard.KeyCtrlC {
				break mainloop
			}
			if char == ' ' || key == keyboard.KeySpace {
				paused = !paused
				for _, d := range activeDownloads {
					d.mu.Lock()
					if d.process != nil {
						if paused {
							d.Status = "Paused"
							pauseProcess(d.process)
						} else {
							d.Status = "Downloading"
							resumeProcess(d.process)
						}
					}
					d.mu.Unlock()
				}
			}
		}

		// Cleanup
		for _, d := range activeDownloads {
			d.cancel()
		}
		wg.Wait()
	})
}

func pauseProcess(process *os.Process) string {
	// Cross-platform pause: suspend process by lowering its priority and blocking its I/O
	// This is not a true freeze, but will effectively "pause" most ffmpeg downloads.
	if process == nil {
		return "No process"
	}
	if runtime.GOOS == "windows" {
		// On Windows, use "pssuspend" if available, else fallback to priority
		pssuspend, err := exec.LookPath("pssuspend.exe")
		if err == nil {
			cmd := exec.Command(pssuspend, strconv.Itoa(process.Pid))
			if err := cmd.Run(); err == nil {
				return "Paused"
			}
		}
		// Fallback: set priority to IDLE
		cmd := exec.Command("cmd", "/C", "wmic", "process", "where", fmt.Sprintf("ProcessId=%d", process.Pid), "CALL", "setpriority", "64")
		if err := cmd.Run(); err == nil {
			return "Priority set to IDLE (soft pause)"
		}
		return "Pause not supported"
	} else {
		// On Unix, send SIGSTOP is not allowed, so fallback to nice/ionice
		// Lower priority (nice +19) and block I/O (ionice class 3)
		exec.Command("renice", "-n", "19", "-p", strconv.Itoa(process.Pid)).Run()
		exec.Command("ionice", "-c", "3", "-p", strconv.Itoa(process.Pid)).Run()
		return "Priority lowered (soft pause)"
	}
}

func resumeProcess(process *os.Process) string {
	if process == nil {
		return "No process"
	}
	if runtime.GOOS == "windows" {
		// On Windows, use "pssuspend -r" if available, else reset priority
		pssuspend, err := exec.LookPath("pssuspend.exe")
		if err == nil {
			cmd := exec.Command(pssuspend, "-r", strconv.Itoa(process.Pid))
			if err := cmd.Run(); err == nil {
				return "Resumed"
			}
		}
		// Fallback: set priority to NORMAL
		cmd := exec.Command("cmd", "/C", "wmic", "process", "where", fmt.Sprintf("ProcessId=%d", process.Pid), "CALL", "setpriority", "8")
		if err := cmd.Run(); err == nil {
			return "Priority set to NORMAL (soft resume)"
		}
		return "Resume not supported"
	} else {
		// On Unix, reset nice/ionice to default
		exec.Command("renice", "-n", "0", "-p", strconv.Itoa(process.Pid)).Run()
		exec.Command("ionice", "-c", "2", "-n", "4", "-p", strconv.Itoa(process.Pid)).Run()
		return "Priority reset (soft resume)"
	}
}

func downloadFile(stat *DownloadStatus, settings Settings) {
	stat.mu.Lock()
	if stat.Status == "Cancelled" {
		stat.mu.Unlock()
		return
	}
	stat.Status = "Downloading"
	stat.mu.Unlock()

	args := []string{"-y", "-i", stat.URL, "-c", "copy", "-bsf:a", "aac_adtstoasc", "-progress", "pipe:1"}
	if settings.SpeedLimit != "" {
		args = append(args, "-limit_rate", settings.SpeedLimit)
	}
	args = append(args, stat.Output)

	cmd := exec.CommandContext(stat.ctx, "ffmpeg", args...)
	stdout, _ := cmd.StdoutPipe()
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		stat.mu.Lock()
		stat.Status, stat.Err = "Failed", err
		stat.mu.Unlock()
		return
	}
	stat.mu.Lock()
	stat.process = cmd.Process
	stat.mu.Unlock()

	scanner := bufio.NewScanner(stdout)
	durationRegex := regexp.MustCompile(`Duration: (\d{2}:\d{2}:\d{2}\.\d{2})`)
	for scanner.Scan() {
		line := scanner.Text()
		if match := durationRegex.FindStringSubmatch(line); len(match) > 1 && stat.Duration == 0 {
			parts := strings.Split(match[1], ":")
			h, _ := time.ParseDuration(parts[0] + "h")
			m, _ := time.ParseDuration(parts[1] + "m")
			s, _ := time.ParseDuration(parts[2] + "s")
			stat.mu.Lock()
			stat.Duration = h + m + s
			stat.mu.Unlock()
		}

		parts := strings.Split(strings.TrimSpace(line), "=")
		if len(parts) != 2 {
			continue
		}
		key, value := parts[0], parts[1]

		stat.mu.Lock()
		switch key {
		case "out_time_us":
			if us, err := strconv.ParseInt(value, 10, 64); err == nil && stat.Duration > 0 {
				elapsed := time.Duration(us) * time.Microsecond
				stat.Elapsed = elapsed
				stat.Progress = (float64(elapsed) / float64(stat.Duration)) * 100
				if stat.Elapsed > 0 {
					stat.Remaining = stat.Duration - elapsed
				}
			}
		case "total_size":
			if size, err := strconv.ParseInt(value, 10, 64); err == nil {
				stat.SizeMB = float64(size) / (1024 * 1024)
			}
		case "speed":
			stat.Speed = value
		}
		stat.mu.Unlock()
	}

	err := cmd.Wait()
	stat.mu.Lock()
	defer stat.mu.Unlock()
	stat.process = nil
	if err == nil {
		stat.Status, stat.Progress = "Completed", 100
		return
	}
	if stat.ctx.Err() != nil {
		stat.Status = "Cancelled"
	} else {
		stat.Status, stat.Err = "Failed", err
	}
}

func renderDownloadsUI(downloads []*DownloadStatus, paused bool) {
	fmt.Print("\033[H") // Move cursor to home
	table := tablewriter.NewWriter(os.Stdout)
	table.SetHeader([]string{"#", "Name", "Progress", ""})
	table.SetAutoWrapText(false)
	table.SetHeaderAlignment(tablewriter.ALIGN_LEFT)
	table.SetAlignment(tablewriter.ALIGN_LEFT)
	table.SetColumnSeparator("  ")
	table.SetBorder(false)
	table.SetHeaderLine(false)
	table.SetRowSeparator("")

	for i, d := range downloads {
		d.mu.Lock()
		bar := "----------"
		if d.Progress > 0 {
			filled := int(d.Progress / 10)
			if filled > 10 {
				filled = 10
			}
			bar = strings.Repeat("=", filled) + strings.Repeat("-", 10-filled)
		}
		statusColors := map[string]color.Attribute{
			"Downloading": color.FgCyan, "Completed": color.FgGreen, "Failed": color.FgRed,
			"Cancelled": color.FgRed, "Paused": color.FgYellow, "Queued": color.FgBlue, "Starting": color.FgWhite,
		}
		statusSymbols := map[string]string{
			"Downloading": "↓", "Completed": "✓", "Failed": "✗",
			"Cancelled": "✗", "Paused": "⏸", "Queued": "→", "Starting": "▶",
		}
		status := color.New(statusColors[d.Status]).Sprint(statusSymbols[d.Status])
		timeStr := fmt.Sprintf("%s/%s", d.Elapsed.Round(time.Second), d.Duration.Round(time.Second))
		remTime := time.Duration(0)
		if d.Elapsed > 0 && d.Duration > 0 {
			if speedVal, err := strconv.ParseFloat(strings.TrimSuffix(d.Speed, "x"), 32); err == nil && speedVal > 0 {
				remTime = time.Duration(float64(d.Remaining) / speedVal).Round(time.Second)
			} else {
				remTime = d.Remaining.Round(time.Second)
			}
		}

		// Truncate: "The Demon Girl Next Door - 001.m3u8" -> "The Demon...- 001"
		name := strings.TrimSuffix(d.Name, filepath.Ext(d.Name))
		if len(name) > 40 {
			keep := 18
			name = name[:keep] + "..." + name[len(name)-(40-keep-3):]
		}

		var progressInfo string
		if d.Progress > 0 {
			progressInfo = fmt.Sprintf("%7.2fMB @ %s (%s) [~%s]", d.SizeMB, d.Speed, timeStr, remTime)
		} else {
			progressInfo = "..."
		}
		row := []string{
			fmt.Sprintf("%2d %s", i+1, status), name,
			fmt.Sprintf("[%s] %5.1f%%", bar, d.Progress),
			progressInfo,
		}
		table.Append(row)
		d.mu.Unlock()
	}
	table.Render()

	footer := "[Space] Pause/Resume | [Esc] Exit"
	if paused {
		footer = "[Space] Resume     | [Esc] Exit"
	}
	fmt.Printf("\n%s", Clr.bold(footer))
	fmt.Print("\033[J") // Clear from cursor to end
}

// ==== Main ==== //
func main() {
	fmt.Printf("%s\n", Clr.bold("M3U Batch Downloader for AniLINK"))
	fmt.Printf("Version: %s\n\n", Clr.cyan(version))

	if err := checkFFmpeg(); err != nil {
		fmt.Printf("%s %v\n", Clr.red("Error:"), err)
		return
	}

	settings := loadSettings()

	filePath := strings.Trim(prompt("M3U file path", ""), "\"'")
	if filePath == "" || !fileExists(filePath) {
		fmt.Printf("%s\n", Clr.red("Invalid file path"))
		return
	}

	links, err := parseM3U(filePath)
	if err != nil || len(links) == 0 {
		fmt.Println(Clr.red("No valid links found"))
		return
	}
	fmt.Printf("%s %d links found\n", Clr.green("✓"), len(links))

	defaultFolder := strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath))
	folder := prompt("Enter the name of the folder to save videos in", defaultFolder)
	os.MkdirAll(folder, 0755)

	if confirm("Customize settings?", false) {
		settings = customizeSettings(settings)
	}

	if links = checkExisting(links, folder); len(links) == 0 {
		fmt.Println(Clr.green("All files already exist."))
		return
	}

	runDownloads(links, folder, settings)
	fmt.Println() // Newline after finishing
}
