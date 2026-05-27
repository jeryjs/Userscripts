package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestParseM3URefererSubtitlesQuality(t *testing.T) {
	p := filepath.Join(t.TempDir(), "x.m3u")
	must0(os.WriteFile(p, []byte(`#EXTVLCOPT:http-referrer=https://ref.example/
#EXT-X-MEDIA:TYPE=SUBTITLES,NAME="English",DEFAULT=YES,URI="https://sub.example/en.vtt"
#EXTINF:-1,[S01-E01] Test Name [1080p]
https://video.example/master.m3u8
#EXTINF:-1,Episode 2
https://video.example/2.m3u8
`), 0644))
	links := parseM3U(p)
	if len(links) != 2 || links[0].Name != "[S01-E01] Test Name" || links[0].Quality != "[1080p]" || links[0].Referer != "https://ref.example/" || len(links[0].Subtitles) != 1 || !links[0].Subtitles[0].Default || len(links[1].Subtitles) != 0 {
		t.Fatalf("bad parse: %#v", links)
	}
}

func TestRangesAndOutputQualityTag(t *testing.T) {
	idx := parseRanges("1,3-4")
	if !idx[1] || !idx[3] || !idx[4] || idx[2] {
		t.Fatalf("bad ranges: %#v", idx)
	}
	links := []LinkInfo{{Name: "Ep", Quality: "[1080p]"}, {Name: "Ep", Quality: "[720p]"}}
	if got := filepath.Base(outputFile(links[0], "out", links, 0)); got != "Ep.mkv" {
		t.Fatal(got)
	}
	if got := filepath.Base(outputFile(links[1], "out", links, 1)); got != "Ep [720p].mkv" {
		t.Fatal(got)
	}
}

func TestResolveHLSVariant(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=100
low.m3u8
#EXT-X-STREAM-INF:RESOLUTION=1920x1080,BANDWIDTH=300
hi.m3u8
`))
	}))
	defer ts.Close()
	got, err := resolveHLSVariant(ts.URL+"/master.m3u8", 0, "", 3)
	if err != nil || got != ts.URL+"/hi.m3u8" {
		t.Fatalf("got %q err %v", got, err)
	}
}
