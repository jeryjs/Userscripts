-- AniLINK M3U8 Player for MPV
-- Auto-adds subtitles from M3U8 playlists with referrer support

local mp = require 'mp'

local m3u8_data = {}

local function parse_m3u8(path)
    mp.msg.info("Parsing M3U8:", path)
    local file = io.open(path, 'r')
    if not file then return {} end
    
    local entries = {}
    local referrer, current_subs = nil, {}
    
    for line in file:lines() do
        if line:match('^#EXTVLCOPT:http%-referrer=(.+)') then
            referrer = line:match('=(.+)')
        elseif line:match('^#EXT%-X%-MEDIA:TYPE=SUBTITLES') then
            -- Parse subtitle entry
            local name = line:match('NAME="([^"]+)"')
            local uri = line:match('URI="([^"]+)"')
            if name and uri then table.insert(current_subs, {name = name, uri = uri}) end
        elseif line:match('^https?://') then
            -- Map new media entry for url to collected subtitles
            entries[line] = current_subs
            current_subs = {}
        end
    end
    
    -- Set HTTP referrer if provided
    if referrer then
        mp.set_property('http-header-fields', 'Referer:' .. referrer)
        mp.msg.info("Set HTTP Referrer to: ", referrer)
    end

    file:close()
    return entries
end

local function add_subtitles()
    local url = mp.get_property('path')
    local subs = m3u8_data[url]
    if not subs then return end
    
    for _, sub in ipairs(subs) do
        mp.commandv('sub-add', sub.uri, 'cached', sub.name)
    end
    
    mp.commandv('set', 'sub', 'auto')
    mp.msg.info('Added', #subs, 'subtitle tracks')
end

local function handle_m3u8()
    local path = mp.get_property('path')
    if path and path:match('%.m3u8$') and not path:match('^https?://') or path:match('/paste.rs/') then
        m3u8_data = parse_m3u8(path)
    end
end

mp.register_event('start-file', handle_m3u8)
mp.register_event('file-loaded', add_subtitles)
mp.msg.info('AniLINK M3U8 plugin loaded')