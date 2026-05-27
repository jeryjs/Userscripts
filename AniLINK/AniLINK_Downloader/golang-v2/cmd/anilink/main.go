package main

import (
	"archive/zip"
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

const version = "2.0.0"

type Settings struct {
	ParallelDownloads, Retries, Timeout, StreamIdx int
	SpeedLimit                                     string
}
type Subtitle struct {
	Name, URL string
	Default   bool
}
type LinkInfo struct {
	Name, URL, Referer, Quality string
	Subtitles                   []Subtitle
}
type Variant struct {
	URL       string
	Bandwidth int
}

type Job struct {
	Link                                                  LinkInfo
	Output                                                string
	mu                                                    sync.Mutex
	Status, Err                                           string
	Progress, SizeMB, Speed, Current, Duration, Remaining float64
	cmd                                                   *exec.Cmd
}

var (
	reader       = bufio.NewReader(os.Stdin)
	debugMode    bool
	debugDir     string
	ansi         = regexp.MustCompile(`\x1b\[[0-9;]*m`)
	badFileChars = regexp.MustCompile(`[\\/:*?"<>|]`)
	bandwidthRE  = regexp.MustCompile(`BANDWIDTH=(\d+)`)
	durationRE   = regexp.MustCompile(`Duration: ([^,]+)`)
	timeRE       = regexp.MustCompile(`time=([0-9:.]+)`)
)

func main() {
	flag.BoolVar(&debugMode, "debug", false, "Write per-attempt ffmpeg logs to ./debug")
	flag.Parse()
	if debugMode {
		debugDir = filepath.Join(must(os.Getwd()), "debug")
		must0(os.MkdirAll(debugDir, 0755))
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	for {
		clear()
		if err := runOnce(ctx); err != nil {
			fmt.Printf("\n\033[31mAn unexpected error occurred: %v\033[0m\n", err)
		}
		if !confirm("\n\nDo you want to process another M3U file?", false) {
			break
		}
	}
}

func runOnce(ctx context.Context) error {
	fmt.Println("\033[1;34mM3U Batch Downloader for AniLINK\033[0m")
	fmt.Printf("Version: %s\n\n", version)
	if err := checkFFmpeg(); err != nil {
		return err
	}
	filePath := sanitizePath(prompt("Path to your M3U file", ""))
	links := parseM3U(filePath)
	if len(links) == 0 {
		fmt.Println("\033[31mNo links found in M3U file.\033[0m")
		return nil
	}
	showEpisodeTable(links)
	selection := prompt("Select episodes to download (e.g., 1,3,5-10 or 'all')", "all")
	if strings.ToLower(selection) != "all" {
		idxs := parseRanges(selection)
		links = filterByRanges(links, idxs)
	}
	if len(links) == 0 {
		fmt.Println("\033[31mNo episodes selected.\033[0m")
		return nil
	}
	folder := prompt("Enter the name of the folder to save videos in", strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath)))
	must0(os.MkdirAll(folder, 0755))
	settings := loadSettings()
	if confirm("Do you want to customize settings?", false) {
		settings = customizeSettings(settings)
	}
	links = checkExistingFiles(links, folder)
	if len(links) == 0 {
		fmt.Println("\033[1;32mNo files to download.\033[0m")
		return nil
	}
	fmt.Print("\n\033[1mStarting downloads...\033[0m\n\n")
	runDownloads(ctx, links, folder, settings)
	fmt.Println("\n\033[1;32mAll downloads completed!\033[0m")
	return nil
}

func prompt(msg, def string) string {
	if def != "" {
		fmt.Printf("%s [%s]: ", msg, def)
	} else {
		fmt.Printf("%s: ", msg)
	}
	s, _ := reader.ReadString('\n')
	s = strings.TrimSpace(s)
	if s == "" {
		return def
	}
	return s
}
func confirm(msg string, def bool) bool {
	d := map[bool]string{true: "Y/n", false: "y/N"}[def]
	s := strings.ToLower(prompt(msg, d))
	if s == "" || s == strings.ToLower(d) {
		return def
	}
	return s == "y" || s == "yes"
}
func clear()                              { fmt.Print("\033[2J\033[H") }
func sanitizePath(path string) string     { return strings.Trim(strings.TrimSpace(path), `"'`) }
func sanitizeFilename(name string) string { return badFileChars.ReplaceAllString(name, "_") }
func must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}
func must0(err error) {
	if err != nil {
		panic(err)
	}
}

func configFile() string {
	var dir string
	if runtime.GOOS == "windows" {
		dir = filepath.Join(os.Getenv("LOCALAPPDATA"), "m3u_downloader")
	} else {
		dir = filepath.Join(must(os.UserHomeDir()), ".config", "m3u_downloader")
	}
	must0(os.MkdirAll(dir, 0755))
	return filepath.Join(dir, "settings.ini")
}

func loadSettings() Settings {
	s := Settings{ParallelDownloads: 4, Retries: 3, Timeout: 30, StreamIdx: 0}
	b, err := os.ReadFile(configFile())
	if err != nil {
		return s
	}
	for _, l := range strings.Split(string(b), "\n") {
		p := strings.SplitN(strings.TrimSpace(l), "=", 2)
		if len(p) != 2 {
			continue
		}
		k, v := strings.TrimSpace(p[0]), strings.TrimSpace(p[1])
		switch k {
		case "parallel_downloads":
			s.ParallelDownloads = atoi(v, 4)
		case "retries":
			s.Retries = atoi(v, 3)
		case "speed_limit":
			s.SpeedLimit = v
		case "timeout":
			s.Timeout = atoi(v, 30)
		case "stream_idx":
			s.StreamIdx = atoi(v, 0)
		}
	}
	return s
}
func saveSettings(s Settings) {
	_ = os.WriteFile(configFile(), []byte(fmt.Sprintf("[Settings]\nparallel_downloads = %d\nretries = %d\nspeed_limit = %s\ntimeout = %d\nstream_idx = %d\n", s.ParallelDownloads, s.Retries, s.SpeedLimit, s.Timeout, s.StreamIdx)), 0644)
}
func atoi(s string, d int) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return d
	}
	return n
}

func customizeSettings(s Settings) Settings {
	for {
		fmt.Println("\nSettings")
		rows([][]string{{"1", "Parallel Downloads", itoa(s.ParallelDownloads)}, {"2", "Retries", itoa(s.Retries)}, {"3", "Speed Limit (e.g., 0, 500k, 2M)", blank(s.SpeedLimit, "None")}, {"4", "Timeout (seconds)", itoa(s.Timeout)}, {"5", "Quality / Program (e.g., 0, 1, 2)", itoa(s.StreamIdx)}})
		choices := prompt("Enter the numbers of the settings you want to change (e.g., 1,3)", "")
		if choices == "" {
			break
		}
		for _, c := range strings.Split(choices, ",") {
			switch strings.TrimSpace(c) {
			case "1":
				s.ParallelDownloads = atoi(prompt("Enter the number of parallel downloads", itoa(s.ParallelDownloads)), s.ParallelDownloads)
			case "2":
				s.Retries = atoi(prompt("Enter the number of retries", itoa(s.Retries)), s.Retries)
			case "3":
				s.SpeedLimit = prompt("Enter the speed limit (e.g., 500k, 2M)", s.SpeedLimit)
			case "4":
				s.Timeout = atoi(prompt("Enter the download timeout in seconds", itoa(s.Timeout)), s.Timeout)
			case "5":
				s.StreamIdx = atoi(prompt("Enter stream index (Usually, 0=highest quality, 1=medium, 2=lowest)", itoa(s.StreamIdx)), s.StreamIdx)
			}
		}
		if !confirm("Do you want to change more settings?", false) {
			break
		}
	}
	saveSettings(s)
	return s
}
func itoa(n int) string { return strconv.Itoa(n) }
func blank(s, b string) string {
	if s == "" {
		return b
	}
	return s
}

func parseM3U(filePath string) []LinkInfo {
	data, err := os.ReadFile(filePath)
	if err != nil {
		fmt.Printf("\033[31mError parsing M3U file: %v\033[0m\n", err)
		return nil
	}
	var links []LinkInfo
	var referer string
	var subtitles []Subtitle
	lines := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
	for i, raw := range lines {
		line := strings.TrimSpace(raw)
		switch {
		case strings.HasPrefix(line, "#EXTVLCOPT:http-referrer="):
			referer = strings.SplitN(line, "=", 2)[1]
		case strings.HasPrefix(line, "#EXT-X-MEDIA:TYPE=SUBTITLES"):
			s := Subtitle{Name: between(line, `NAME="`, `"`), URL: between(line, `URI="`, `"`), Default: strings.Contains(line, "DEFAULT=YES")}
			if s.URL != "" {
				subtitles = append(subtitles, s)
			}
		case strings.HasPrefix(line, "#EXTINF"):
			name := fmt.Sprintf("Episode %d", len(links)+1)
			if p := strings.SplitN(line, ",", 2); len(p) == 2 {
				name = p[1]
			}
			if i+1 >= len(lines) {
				continue
			}
			u := strings.TrimSpace(lines[i+1])
			if u == "" || strings.HasPrefix(u, "#") {
				continue
			}
			quality := ""
			if a, b := strings.LastIndex(name, "["), strings.LastIndex(name, "]"); a >= 0 && b >= a {
				quality, name = name[a:b+1], strings.TrimSpace(name[:a])
			}
			links = append(links, LinkInfo{Name: name, URL: u, Referer: referer, Subtitles: append([]Subtitle(nil), subtitles...), Quality: quality})
			subtitles = nil
		}
	}
	return links
}
func between(s, a, b string) string {
	i := strings.Index(s, a)
	if i < 0 {
		return ""
	}
	s = s[i+len(a):]
	j := strings.Index(s, b)
	if j < 0 {
		return ""
	}
	return s[:j]
}

func parseRanges(s string) map[int]bool {
	r := map[int]bool{}
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if strings.Contains(part, "-") {
			p := strings.SplitN(part, "-", 2)
			a, b := atoi(p[0], 0), atoi(p[1], 0)
			for i := a; i <= b; i++ {
				r[i] = true
			}
		} else {
			r[atoi(part, 0)] = true
		}
	}
	return r
}
func filterByRanges(links []LinkInfo, idx map[int]bool) []LinkInfo {
	out := []LinkInfo{}
	for i, l := range links {
		if idx[i+1] {
			out = append(out, l)
		}
	}
	return out
}

func showEpisodeTable(links []LinkInfo) {
	fmt.Println("\nAvailable Episodes")
	show := func(i int) { fmt.Printf("%4d  %s\n", i+1, links[i].Name) }
	if len(links) > 15 {
		for i := 0; i < 7; i++ {
			show(i)
		}
		fmt.Println(" ...  ...")
		for i := max(7, len(links)-7); i < len(links); i++ {
			show(i)
		}
	} else {
		for i := range links {
			show(i)
		}
	}
}
func rows(r [][]string) {
	for _, row := range r {
		fmt.Printf("%4s  %-36s %s\n", row[0], row[1], row[2])
	}
}

func outputFile(link LinkInfo, folder string, all []LinkInfo, idx int) string {
	name := sanitizeFilename(strings.TrimSuffix(link.Name, filepath.Ext(link.Name)))
	if all != nil && idx >= 0 && link.Quality != "" {
		dup := []int{}
		for i, l := range all {
			if strings.TrimSuffix(l.Name, filepath.Ext(l.Name)) == strings.TrimSpace(strings.Split(link.Name, "[")[0]) {
				dup = append(dup, i)
			}
		}
		for pos, v := range dup {
			if v == idx && len(dup) > 1 && pos > 0 {
				name += " " + link.Quality
			}
		}
	}
	return filepath.Join(folder, name+".mkv")
}

func checkExistingFiles(links []LinkInfo, folder string) []LinkInfo {
	type ex struct {
		idx  int
		path string
		size float64
	}
	var existing []ex
	for i, l := range links {
		p := outputFile(l, folder, links, i)
		if st, err := os.Stat(p); err == nil {
			existing = append(existing, ex{i + 1, p, float64(st.Size()) / (1024 * 1024)})
		}
	}
	if len(existing) == 0 {
		return links
	}
	fmt.Println("\n\033[1;33mThe following files already exist:\033[0m")
	for _, e := range existing {
		fmt.Printf("%4d  %-60s %8.2f MB\n", e.idx, filepath.Base(e.path), e.size)
	}
	o := parseRanges(prompt("Select the files to overwrite (e.g., 1-3,5)", ""))
	out := []LinkInfo{}
	for i, l := range links {
		if o[i+1] || !exists(outputFile(l, folder, links, i)) {
			out = append(out, l)
		}
	}
	return out
}
func exists(p string) bool { _, err := os.Stat(p); return err == nil }

func resolveHLSVariant(raw string, idx int, referer string, timeout int) (string, error) {
	req, _ := http.NewRequest("GET", raw, nil)
	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	client := &http.Client{Timeout: time.Duration(timeout) * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return "", fmt.Errorf("%s", res.Status)
	}
	b, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}
	text := string(b)
	if !strings.Contains(text, "#EXT-X-STREAM-INF") {
		return raw, nil
	}
	lines := strings.Split(text, "\n")
	variants := []Variant{}
	for i, l := range lines {
		l = strings.TrimSpace(l)
		if !strings.HasPrefix(l, "#EXT-X-STREAM-INF:") || i+1 >= len(lines) {
			continue
		}
		next := strings.TrimSpace(lines[i+1])
		if next == "" || strings.HasPrefix(next, "#") {
			continue
		}
		bw := -1
		if m := bandwidthRE.FindStringSubmatch(l); len(m) > 1 {
			bw = atoi(m[1], -1)
		}
		variants = append(variants, Variant{URL: joinURL(raw, next), Bandwidth: bw})
	}
	if len(variants) == 0 {
		return raw, nil
	}
	sort.Slice(variants, func(i, j int) bool { return variants[i].Bandwidth > variants[j].Bandwidth })
	idx = min(max(idx, 0), len(variants)-1)
	return variants[idx].URL, nil
}
func joinURL(base, ref string) string {
	u, err := url.Parse(base)
	if err != nil {
		return ref
	}
	r, err := url.Parse(ref)
	if err != nil {
		return ref
	}
	return u.ResolveReference(r).String()
}

func checkFFmpeg() error {
	if _, err := exec.LookPath("ffmpeg"); err == nil {
		return nil
	}
	if !confirm("\033[31mffmpeg not found.\033[0m Download/install minimal version?", true) {
		return errors.New("ffmpeg is required")
	}
	return installFFmpeg()
}
func installFFmpeg() error {
	if runtime.GOOS != "windows" {
		if _, err := exec.LookPath("pkg"); err == nil {
			return runForeground("pkg", "install", "-y", "ffmpeg")
		}
		if _, err := exec.LookPath("apt"); err == nil {
			return runForeground("apt", "install", "-y", "ffmpeg")
		}
		return errors.New("install ffmpeg with your package manager")
	}
	fmt.Println("Downloading minimal ffmpeg...")
	dir := ".ffmpeg"
	must0(os.MkdirAll(dir, 0755))
	zipPath := filepath.Join(dir, "ffmpeg.zip")
	if err := downloadFile("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", zipPath); err != nil {
		return err
	}
	if err := unzipFFmpeg(zipPath, dir); err != nil {
		return err
	}
	os.Setenv("PATH", findFFmpegDir(dir)+string(os.PathListSeparator)+os.Getenv("PATH"))
	return nil
}
func runForeground(name string, args ...string) error {
	c := exec.Command(name, args...)
	c.Stdout, c.Stderr, c.Stdin = os.Stdout, os.Stderr, os.Stdin
	return c.Run()
}
func downloadFile(src, dst string) error {
	r, err := http.Get(src)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	f, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, r.Body)
	return err
}
func unzipFFmpeg(zp, dir string) error {
	r, err := zip.OpenReader(zp)
	if err != nil {
		return err
	}
	defer r.Close()
	for _, f := range r.File {
		if !strings.HasSuffix(strings.ToLower(f.Name), "ffmpeg.exe") {
			continue
		}
		rc, _ := f.Open()
		defer rc.Close()
		outDir := filepath.Join(dir, filepath.Dir(f.Name))
		must0(os.MkdirAll(outDir, 0755))
		out, err := os.Create(filepath.Join(outDir, "ffmpeg.exe"))
		if err != nil {
			return err
		}
		defer out.Close()
		_, err = io.Copy(out, rc)
		return err
	}
	return errors.New("ffmpeg.exe was not found after extraction")
}
func findFFmpegDir(dir string) string {
	found := dir
	filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if !d.IsDir() && strings.EqualFold(d.Name(), "ffmpeg.exe") {
			found = filepath.Dir(p)
		}
		return nil
	})
	return found
}

func runDownloads(parent context.Context, links []LinkInfo, folder string, settings Settings) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	jobs := make([]*Job, len(links))
	for i, l := range links {
		jobs[i] = &Job{Link: l, Output: outputFile(l, folder, links, i), Status: "Queued"}
	}
	done := make(chan struct{})
	sem := make(chan struct{}, max(1, settings.ParallelDownloads))
	var wg sync.WaitGroup
	for _, j := range jobs {
		wg.Add(1)
		go func(job *Job) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
				downloadJob(ctx, job, settings)
			case <-ctx.Done():
				job.set("Cancelled", 0, "")
			}
		}(j)
	}
	go func() { wg.Wait(); close(done) }()
	_, _ = tea.NewProgram(newModel(jobs, done, cancel), tea.WithAltScreen()).Run()
	cancel()
	for _, j := range jobs {
		terminateJob(j)
	}
	wg.Wait()
}

func downloadJob(ctx context.Context, j *Job, s Settings) {
	src, err := resolveHLSVariant(j.Link.URL, s.StreamIdx, j.Link.Referer, s.Timeout)
	if err != nil {
		j.fail("playlist resolve failed: " + err.Error())
		return
	}
	for attempt := 1; attempt <= s.Retries; attempt++ {
		if ctx.Err() != nil {
			j.set("Cancelled", 0, "")
			return
		}
		if err = runFFmpegAttempt(ctx, j, s, src, attempt); err == nil {
			j.complete()
			return
		}
		if attempt == s.Retries {
			j.fail(err.Error())
		} else {
			j.set(fmt.Sprintf("Retry %d/%d", attempt, s.Retries), j.Progress, "")
		}
	}
}

func runFFmpegAttempt(ctx context.Context, j *Job, s Settings, src string, attempt int) error {
	args := []string{"-y", "-nostdin", "-progress", "pipe:1", "-extension_picky", "false"}
	if j.Link.Referer != "" {
		args = append(args, "-headers", "Referer: "+j.Link.Referer+"\r\n")
	}
	args = append(args, "-i", src)
	for _, sub := range j.Link.Subtitles {
		args = append(args, "-i", sub.URL)
	}
	args = append(args, "-map", "0:v:0?", "-map", "0:a:0?")
	for i := range j.Link.Subtitles {
		args = append(args, "-map", itoa(i+1))
	}
	args = append(args, "-c", "copy")
	for i, sub := range j.Link.Subtitles {
		lang := strings.ToLower(firstN(blank(sub.Name, "Unknown"), 3))
		args = append(args, fmt.Sprintf("-metadata:s:s:%d", i), "language="+lang, fmt.Sprintf("-metadata:s:s:%d", i), "title="+blank(sub.Name, "Subtitle"))
		if sub.Default {
			args = append(args, fmt.Sprintf("-disposition:s:%d", i), "default")
		}
	}
	args = append(args, "-metadata", "title="+strings.TrimSuffix(j.Link.Name, ".m3u8"))
	if s.SpeedLimit != "" && s.SpeedLimit != "0" {
		args = append(args, "-maxrate", s.SpeedLimit)
	}
	args = append(args, j.Output)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	prepareCmd(cmd)
	cmd.Cancel = func() error { killCmd(cmd); return nil }
	out, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	er, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	log, logPath := openDebug(j, attempt, s, src, args)
	if log != nil {
		defer func() { log.Close(); fmt.Printf("\n\033[2mDebug log written to %s\033[0m\n", logPath) }()
	}
	if err = cmd.Start(); err != nil {
		return err
	}
	j.mu.Lock()
	j.cmd = cmd
	j.Status = "Downloading"
	j.mu.Unlock()
	if log != nil {
		fmt.Fprintf(log, "PID: %d\n\n", cmd.Process.Pid)
	}
	var mu sync.Mutex
	tail := []string{}
	start := time.Now()
	handle := func(line string) {
		mu.Lock()
		defer mu.Unlock()
		tail = append(tail, line)
		if len(tail) > 200 {
			tail = tail[1:]
		}
		if log != nil {
			fmt.Fprintln(log, line)
		}
		j.parseProgress(line, start)
	}
	var swg sync.WaitGroup
	for _, r := range []io.Reader{out, er} {
		swg.Add(1)
		go func(rd io.Reader) {
			defer swg.Done()
			sc := bufio.NewScanner(rd)
			sc.Buffer(make([]byte, 1024), 1024*1024)
			for sc.Scan() {
				handle(sc.Text())
			}
		}(r)
	}
	swg.Wait()
	err = cmd.Wait()
	j.mu.Lock()
	j.cmd = nil
	j.mu.Unlock()
	if log != nil {
		fmt.Fprintf(log, "\nReturn code: %v\n", cmd.ProcessState)
	}
	if err != nil {
		return fmt.Errorf("ffmpeg exited: %v: %s", err, strings.TrimSpace(strings.Join(last(tail, 12), "\n")))
	}
	return nil
}

func openDebug(j *Job, attempt int, s Settings, src string, args []string) (*os.File, string) {
	if !debugMode {
		return nil, ""
	}
	safe := sanitizeFilename(strings.TrimSuffix(j.Link.Name, filepath.Ext(j.Link.Name)))
	if len(safe) > 80 {
		safe = safe[:80]
	}
	now := time.Now()
	p := filepath.Join(debugDir, fmt.Sprintf("%s-%06d_%s_attempt%d.log", now.Format("20060102-150405"), now.Nanosecond()/1000, blank(safe, "download"), attempt))
	f, _ := os.Create(p)
	if f != nil {
		fmt.Fprintf(f, "Name: %s\nAttempt: %d/%d\nOutput: %s\nResolved Source URL: %s\nReferer: %s\nStream Index: %d\nParallel Downloads: %d\nRetries: %d\nTimeout: %d\nSpeed Limit: %s\nSubtitles:\n", j.Link.Name, attempt, s.Retries, j.Output, src, blank(j.Link.Referer, "None"), s.StreamIdx, s.ParallelDownloads, s.Retries, s.Timeout, blank(s.SpeedLimit, "None"))
		if len(j.Link.Subtitles) == 0 {
			fmt.Fprintln(f, "  (none)")
		} else {
			for _, sub := range j.Link.Subtitles {
				fmt.Fprintf(f, "  - %s | %s\n", blank(sub.Name, "Subtitle"), sub.URL)
			}
		}
		fmt.Fprintf(f, "Command: %s\n\n", strings.Join(append([]string{"ffmpeg"}, args...), " "))
	}
	return f, p
}

func (j *Job) parseProgress(line string, start time.Time) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if m := durationRE.FindStringSubmatch(line); len(m) > 1 {
		if d := parseClock(m[1]); d > 0 {
			j.Duration = d
		}
	}
	t := 0.0
	if m := timeRE.FindStringSubmatch(line); len(m) > 1 {
		t = parseClock(m[1])
	} else if strings.HasPrefix(line, "out_time=") {
		t = parseClock(strings.TrimPrefix(line, "out_time="))
	}
	if t > 0 && j.Duration > 0 {
		j.Current = t
		j.Progress = minf(t/j.Duration*100, 100)
		j.Speed = t / maxf(time.Since(start).Seconds(), .001)
		j.Remaining = (j.Duration - t) / maxf(j.Speed, .001)
	}
	if st, err := os.Stat(j.Output); err == nil {
		j.SizeMB = float64(st.Size()) / (1024 * 1024)
	}
}
func parseClock(s string) float64 {
	if strings.Contains(s, "N/A") {
		return 0
	}
	p := strings.Split(s, ":")
	if len(p) != 3 {
		return 0
	}
	h, _ := strconv.ParseFloat(p[0], 64)
	m, _ := strconv.ParseFloat(p[1], 64)
	sec, _ := strconv.ParseFloat(p[2], 64)
	return h*3600 + m*60 + sec
}
func (j *Job) set(st string, progress float64, err string) {
	j.mu.Lock()
	j.Status, j.Progress, j.Err = st, progress, err
	j.mu.Unlock()
}
func (j *Job) fail(err string) { j.set("Failed", j.Progress, err) }
func (j *Job) complete() {
	if st, err := os.Stat(j.Output); err == nil {
		j.SizeMB = float64(st.Size()) / (1024 * 1024)
	}
	j.set("Completed", 100, "")
}

func terminateJob(j *Job) {
	j.mu.Lock()
	cmd := j.cmd
	j.mu.Unlock()
	if cmd == nil || cmd.Process == nil {
		return
	}
	killCmd(cmd)
}

type tickMsg struct{}
type doneMsg struct{}
type model struct {
	jobs          []*Job
	vp            viewport.Model
	done          <-chan struct{}
	cancel        context.CancelFunc
	finished      bool
	width, height int
}

func newModel(jobs []*Job, done <-chan struct{}, cancel context.CancelFunc) model {
	vp := viewport.New(80, 20)
	return model{jobs: jobs, vp: vp, done: done, cancel: cancel}
}
func (m model) Init() tea.Cmd {
	return tea.Batch(func() tea.Msg { <-m.done; return doneMsg{} }, tea.Tick(200*time.Millisecond, func(time.Time) tea.Msg { return tickMsg{} }))
}
func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	switch v := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = v.Width, v.Height
		m.vp.Width, m.vp.Height = max(20, v.Width), max(1, v.Height-4)
		m.vp.SetContent(m.content())
	case tickMsg:
		m.vp.SetContent(m.content())
		if !m.finished {
			return m, tea.Tick(200*time.Millisecond, func(time.Time) tea.Msg { return tickMsg{} })
		}
	case doneMsg:
		m.finished = true
		m.vp.SetContent(m.content())
		return m, tea.Quit
	case tea.KeyMsg:
		switch v.String() {
		case "ctrl+c", "q", "esc":
			m.cancel()
			for _, j := range m.jobs {
				terminateJob(j)
			}
			return m, tea.Quit
		}
	}
	m.vp, cmd = m.vp.Update(msg)
	return m, cmd
}
func (m model) View() string {
	return lipgloss.NewStyle().Bold(true).Render("AniLINK Downloads") + "\n" + m.vp.View() + "\n" + lipgloss.NewStyle().Faint(true).Render("↑/↓ PgUp/PgDn scroll • q/esc/ctrl+c cancel/exit")
}
func (m model) content() string {
	w := max(80, m.width)
	lines := []string{}
	for i, j := range m.jobs {
		j.mu.Lock()
		name := truncateMiddle(j.Link.Name, max(50, int(float64(w)*0.45)))
		bar := bar(j.Progress, max(10, min(28, w/5)))
		status := j.Status
		if j.Err != "" {
			status += ": " + truncateMiddle(j.Err, max(20, w/3))
		}
		line := fmt.Sprintf("%3d %-10s %-*s [%s] %6.2f%% %6.1fMB @ %.2fx (%d/%ds) [~%ds]", i+1, status, max(20, min(55, w/2)), name, bar, j.Progress, j.SizeMB, j.Speed, int(j.Current), int(j.Duration), int(j.Remaining))
		j.mu.Unlock()
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}
func bar(p float64, n int) string {
	f := int(p / 100 * float64(n))
	return strings.Repeat("█", min(f, n)) + strings.Repeat("░", max(0, n-f))
}
func truncateMiddle(s string, maxLen int) string {
	s = ansi.ReplaceAllString(s, "")
	if len([]rune(s)) <= maxLen {
		return s
	}
	r := []rune(s)
	a := int(float64(maxLen) * .7)
	b := maxLen - a - 3
	return string(r[:a]) + "..." + string(r[len(r)-b:])
}

func firstN(s string, n int) string {
	r := []rune(s)
	if len(r) < n {
		return s
	}
	return string(r[:n])
}
func last[T any](s []T, n int) []T {
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
func minf(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
func maxf(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
