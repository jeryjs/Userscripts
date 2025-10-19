-- AniLINK M3U8 Player for MPV
-- Version: 2.0.0
-- Auto-adds subtitles from M3U8 playlists with referrer/origin support

local mp = require 'mp'
local utils = require 'mp.utils'

local episodes = {}
local current_episode_idx = 0
local last_set_referrer = nil

local function parse_m3u8(path)
    mp.msg.info("Parsing M3U8:", path)
    local file
    if path:match('^https?://') then
        local curl_cmd = string.format('curl -L --silent "%s"', path)
        file = io.popen(curl_cmd, 'r')
    else
        file = io.open(path, 'r')
    end
    if not file then return nil end
    
    local lines = {}
    for line in file:lines() do
        table.insert(lines, line)
    end
    file:close()
    
    -- Parse entire playlist structure first
    local episodes = {}
    local current_referrer, current_origin = nil, nil
    local pending_subs = {}
    local pending_audio = {}
    
    for i, line in ipairs(lines) do
        if line:match('^#EXTVLCOPT:http%-referrer=(.+)') then
            current_referrer = line:match('=(.+)')
            current_origin = current_referrer:match('^(https?://[^/]+)') or current_referrer
        elseif line:match('^#EXT%-X%-MEDIA:') then
            local media_type = line:match('TYPE=(%w+)')
            local group_id = line:match('GROUP%-ID="([^"]+)"')
            local name = line:match('NAME="([^"]+)"')
            local uri = line:match('URI="([^"]+)"')
            local is_default = line:match('DEFAULT=YES') ~= nil
            
            if media_type == 'SUBTITLES' and name and uri then
                table.insert(pending_subs, {name = name, uri = uri, default = is_default, group = group_id})
            elseif media_type == 'AUDIO' and name and uri then
                table.insert(pending_audio, {name = name, uri = uri, default = is_default, group = group_id})
            end
        elseif line:match('^#EXTINF:') then
            local title = line:match(',(.+)') or 'Episode'
            local next_line = lines[i + 1]
            if next_line and next_line:match('^https?://') then
                table.insert(episodes, {
                    title = title,
                    url = next_line,
                    subtitles = pending_subs,
                    audio = pending_audio,
                    referrer = current_referrer,
                    origin = current_origin
                })
                pending_subs = {}
                pending_audio = {}
            end
        end
    end
    
    return episodes
end

local function add_subtitles_parallel()
    local current_url = mp.get_property('path')
    if not current_url then return end
    
    -- Find current episode
    local episode = nil
    for idx, ep in ipairs(episodes) do
        if ep.url == current_url then
            episode = ep
            current_episode_idx = idx
            break
        end
    end
    
    if not episode then
        mp.msg.verbose("Episode not found in playlist")
        return
    end
    
    -- Update referrer if different from last set
    if episode.referrer and episode.referrer ~= last_set_referrer then
        mp.set_property('http-header-fields', 'Referer:' .. episode.referrer .. ',Origin:' .. episode.origin)
        mp.msg.info("Updated headers - Referrer:" .. episode.referrer .. ", Origin:" .. episode.origin)
        last_set_referrer = episode.referrer
    end
    
    if not episode.subtitles or #episode.subtitles == 0 then
        mp.msg.verbose("No subtitles for current episode")
        return
    end
    
    mp.msg.info("Adding", #episode.subtitles, "subtitle tracks for:", episode.title)
    
    -- Add all subtitles in parallel (non-blocking) with completion tracking
    local total = #episode.subtitles
    local completed = 0
    
    for _, sub in ipairs(episode.subtitles) do
        mp.command_native_async({
            name = 'sub-add',
            url = sub.uri,
            flags = 'cached',
            title = sub.name
        }, function(success, result, error)
            completed = completed + 1
            if completed == total then
                -- All subtitles loaded, now auto-select
                mp.commandv('set', 'sub', 'auto')
                mp.msg.info("Successfully loaded", total, "subtitles")
            end
        end)
    end
    
    mp.msg.info("Queued", total, "subtitles for parallel loading")
end

local function handle_m3u8()
    local path = mp.get_property('path')
    if not path then return end

    -- Only parse local m3u8 files or paste.rs URLs (paste.rs is the workaround used by AniLINK for playing entire playlists)
    if path:match('%.m3u8$') and (not path:match('^https?://') or path:match('paste%.rs/')) then
        local parsed = parse_m3u8(path)
        if parsed then
            episodes = parsed
            mp.msg.info("Parsed playlist with", #episodes, "episodes")
        end
    end
end

mp.register_event('start-file', handle_m3u8)
mp.register_event('file-loaded', add_subtitles_parallel)
mp.msg.info('AniLINK M3U8 plugin loaded')