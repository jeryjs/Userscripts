__version__ = "1.4.0"

# pip install rich configparser py7zr requests

import time
from rich.console import Console
from rich.prompt import Prompt, Confirm
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn
from configparser import ConfigParser
import os
import subprocess
import threading
import requests
import py7zr
import signal
import re

console = Console()
config = ConfigParser()

if os.name == 'nt':  # Windows
    config_dir = os.path.join(os.environ['LOCALAPPDATA'], 'm3u_downloader')
else:  # macOS, Linux, etc.
    config_dir = os.path.join(os.path.expanduser("~"), '.config', 'm3u_downloader')

os.makedirs(config_dir, exist_ok=True)
config_file = os.path.join(config_dir, 'settings.ini')

active_downloads = []

def parse_duration(line):
    time_str = line.split('Duration: ')[1].split(',')[0]
    if 'N/A' in time_str:
        return 0.0
    h, m, s = time_str.split(':')
    return float(h) * 3600 + float(m) * 60 + float(s)

def parse_time(line):
    time_str = line.split('time=')[1].split()[0]
    h, m, s = time_str.split(':')
    return float(h) * 3600 + float(m) * 60 + float(s)

def get_download_folder(default_folder):
    folder = Prompt.ask("Enter the name of the folder to save videos in", default=default_folder)
    if not os.path.exists(folder):
        os.makedirs(folder)
    return folder

def get_file_extension(url):
    return '.mkv'  # Always use MKV for metadata and track support
    
def sanitize_path(path):
    return path.strip('"').strip("'")

def sanitize_filename(name):
    # Remove invalid Windows filename characters: \ / : * ? " < > |
    return re.sub(r'[\\/:*?"<>|]', "_", name)

def load_settings():
    settings = {
        'parallel_downloads': 4,
        'retries': 3,
        'speed_limit': None,
        'timeout': 30
    }
    if os.path.exists(config_file):
        config.read(config_file)
        if 'Settings' in config.sections():
            settings['parallel_downloads'] = config.getint('Settings', 'parallel_downloads', fallback=4)
            settings['retries'] = config.getint('Settings', 'retries', fallback=3)
            settings['speed_limit'] = config.get('Settings', 'speed_limit', fallback=None)
            settings['timeout'] = config.getint('Settings', 'timeout', fallback=30)
    return settings

def save_settings(settings):
    config['Settings'] = {
        'parallel_downloads': str(settings['parallel_downloads']),
        'retries': str(settings['retries']),
        'speed_limit': settings['speed_limit'] or '',
        'timeout': str(settings['timeout'])
    }
    with open(config_file, 'w') as configfile:
        config.write(configfile)

def customize_settings(settings):
    while True:
        table = Table(title="Settings")
        table.add_column("No.", justify="right")
        table.add_column("Setting")
        table.add_column("Value")
        table.add_row("1", "Parallel Downloads", str(settings['parallel_downloads']))
        table.add_row("2", "Retries", str(settings['retries']))
        table.add_row("3", "Speed Limit (e.g., 500k, 2M)", settings['speed_limit'] or "None")
        table.add_row("4", "Timeout (seconds)", str(settings['timeout']))
        console.print(table)
        choices = Prompt.ask("Enter the numbers of the settings you want to change (e.g., 1,3)", default="")
        if not choices:
            break
        for choice in choices.split(','):
            choice = choice.strip()
            if choice == '1':
                settings['parallel_downloads'] = int(Prompt.ask("Enter the number of parallel downloads", default=str(settings['parallel_downloads'])))
            elif choice == '2':
                settings['retries'] = int(Prompt.ask("Enter the number of retries", default=str(settings['retries'])))
            elif choice == '3':
                settings['speed_limit'] = Prompt.ask("Enter the speed limit (e.g., 500k, 2M)", default=settings['speed_limit'] or "")
                if not settings['speed_limit']:
                    settings['speed_limit'] = None
            elif choice == '4':
                settings['timeout'] = int(Prompt.ask("Enter the download timeout in seconds", default=str(settings['timeout'])))
        confirm = Confirm.ask("Do you want to change more settings?", default=False)
        if not confirm:
            break
    save_settings(settings)
    return settings

def check_ffmpeg():
    try:
        subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError:
        choice = Confirm.ask("[red]ffmpeg not found.[/red] Download minimal version?", default=True)
        if choice:
            download_ffmpeg()
        else:
            console.print("[red]ffmpeg is required.[/red]")
            exit()

def download_ffmpeg():
    console.print("Downloading minimal ffmpeg...")
    ffmpeg_url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-essentials.7z"
    ffmpeg_dir = os.path.join('.ffmpeg')
    os.makedirs(ffmpeg_dir, exist_ok=True)
    ffmpeg_archive = os.path.join(ffmpeg_dir, 'ffmpeg.7z')
    with requests.get(ffmpeg_url, stream=True) as r:
        with open(ffmpeg_archive, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    with py7zr.SevenZipFile(ffmpeg_archive, mode='r') as archive:
        archive.extractall(ffmpeg_dir)
    ffmpeg_bin = os.path.join(ffmpeg_dir, 'ffmpeg-git-essentials', 'bin')
    os.environ["PATH"] = ffmpeg_bin + os.pathsep + os.environ["PATH"]
    console.print("ffmpeg installed.")

def parse_m3u(file_path):
    links = []
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            lines = file.readlines()
            referer = None
            subtitles = []
            
            for i, line in enumerate(lines):
                line = line.strip()
                if line.startswith('#EXTVLCOPT:http-referrer='):
                    referer = line.split('=', 1)[1]
                elif line.startswith('#EXT-X-MEDIA:TYPE=SUBTITLES'):
                    # Extract subtitle info: NAME="English",URI="https://..."
                    sub_info = {}
                    if 'NAME="' in line:
                        sub_info['name'] = line.split('NAME="')[1].split('"')[0]
                    if 'URI="' in line:
                        sub_info['url'] = line.split('URI="')[1].split('"')[0]
                    if 'DEFAULT=YES' in line:
                        sub_info['default'] = True
                    if sub_info.get('url'):
                        subtitles.append(sub_info)
                elif line.startswith('#EXTINF'):
                    name = line.split(',', 1)[1] if ',' in line else f"Episode {len(links)+1}"
                    url = lines[i + 1].strip() if i + 1 < len(lines) else None
                    if url and not url.startswith('#'):
                        quality = None
                        if '[' in name and ']' in name:
                            quality = name[name.rfind('['):name.rfind(']')+1]
                            name = name[:name.rfind('[')].strip()
                        
                        links.append({
                            'name': name,
                            'url': url,
                            'referer': referer,
                            'subtitles': subtitles.copy(),
                            'quality': quality
                        })
                        subtitles = []
    except Exception as e:
        console.print(f"[red]Error parsing M3U file: {e}[/red]")
    return links

def parse_number_ranges(s):
    result = set()
    for part in s.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, b = part.split('-')
            result.update(range(int(a), int(b)+1))
        else:
            result.add(int(part))
    return result

def get_output_file(link_info, folder, all_links=None, idx=None):
    name_without_ext = os.path.splitext(link_info['name'])[0]
    name_without_ext = sanitize_filename(name_without_ext)
    
    # Smart quality tagging: only add quality if duplicate names exist
    if all_links and idx is not None and link_info.get('quality'):
        base_name = name_without_ext
        duplicates = [i for i, l in enumerate(all_links) if os.path.splitext(l['name'])[0] == link_info['name'].split('[')[0].strip()]
        if len(duplicates) > 1 and duplicates.index(idx) > 0:
            name_without_ext += f" {link_info['quality']}"
    
    ext = get_file_extension(link_info['url'])
    return os.path.join(folder, f"{name_without_ext}{ext}")

def check_existing_files(links, folder):
    existing_files = []
    for idx, link_info in enumerate(links):
        output_file = get_output_file(link_info, folder, links, idx)
        if os.path.exists(output_file):
            file_size = os.path.getsize(output_file) / (1024 * 1024)  # size in MB
            existing_files.append((idx + 1, output_file, file_size))
    if existing_files:
        console.print("\n[bold yellow]The following files already exist:[/bold yellow]")
        table = Table()
        table.add_column("No.", justify="right")
        table.add_column("File Name")
        table.add_column("Size (MB)", justify="right")
        for idx, output_file, size in existing_files:
            table.add_row(str(idx), os.path.basename(output_file), f"{size:.2f}")
        console.print(table)
        choices = Prompt.ask("Select the files to overwrite (e.g., 1-3,5)", default="")
        overwrite_indices = parse_number_ranges(choices)
        new_links = []
        for idx, link_info in enumerate(links):
            if (idx + 1) in overwrite_indices or not os.path.exists(get_output_file(link_info, folder, links, idx)):
                new_links.append(link_info)
        return new_links
    return links

def download_stream(link_info, folder, progress_group, settings, all_links=None, idx=None):
    global active_downloads
    retries = settings['retries']
    name = link_info['name']
    output_file = get_output_file(link_info, folder, all_links, idx)
    task = progress_group.add_task(f"[cyan]{name}[/cyan]", total=100, start=False, filename=output_file)
    active_downloads.append((task, link_info))
    
    for attempt in range(1, retries + 1):
        try:
            ffmpeg_command = ['ffmpeg', '-y', '-progress', 'pipe:1']
            
            # Add referer header if present
            if link_info.get('referer'):
                ffmpeg_command.extend(['-headers', f"Referer: {link_info['referer']}\r\n"])
            
            # Add video input
            ffmpeg_command.extend(['-i', link_info['url']])
            
            # Add subtitle inputs
            subtitles = link_info.get('subtitles', [])
            for sub in subtitles:
                ffmpeg_command.extend(['-i', sub['url']])
            
            # Copy all streams
            ffmpeg_command.extend(['-c', 'copy'])
            
            # Add subtitle metadata
            for i, sub in enumerate(subtitles):
                lang = sub.get('name', 'Unknown')[:3].lower()  # Use first 3 chars as lang code
                ffmpeg_command.extend([
                    f'-metadata:s:s:{i}', f'language={lang}',
                    f'-metadata:s:s:{i}', f'title={sub.get("name", "Subtitle")}'
                ])
                if sub.get('default'):
                    ffmpeg_command.extend([f'-disposition:s:{i}', 'default'])
            
            # Add title metadata
            ffmpeg_command.extend(['-metadata', f'title={name}'])
            
            if settings['speed_limit']:
                ffmpeg_command.extend(['-maxrate', settings['speed_limit']])
            
            ffmpeg_command.append(output_file)
            
            process = subprocess.Popen(ffmpeg_command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)
            link_info['process'] = process
            progress_group.start_task(task)
            duration = None
            start_time = time.time()
            
            while True:
                line = process.stdout.readline() # type: ignore
                if not line:
                    break
                if 'Duration' in line:
                    duration = parse_duration(line) or duration
                elif 'time=' in line and duration:
                    current_time = parse_time(line)
                    progress = (current_time / duration) * 100
                    elapsed = time.time() - start_time
                    speed = (current_time / elapsed) if elapsed > 0 else 0
                    remaining = (duration - current_time) / speed if speed > 0 else 0
                    size_mb = os.path.getsize(output_file) / (1024 * 1024) if os.path.exists(output_file) else 0
                    progress_group.update(task, completed=min(progress, 100),
                        description=f"[cyan]{name} - {size_mb:.1f}MB @ {speed:.2f}x ({int(current_time)}/{int(duration)}s) [~{int(remaining)}s][/cyan]")
            
            process.wait(timeout=settings['timeout'])
            if process.returncode == 0:
                size = f"{os.path.getsize(output_file) / (1024*1024):.1f}MB"
                progress_group.update(task, completed=100, description=f"[green]{name} ✓ ({size})[/green]")
                break
            else:
                raise Exception(f"ffmpeg exited with code {process.returncode}")
        except KeyboardInterrupt:
            signal_handler(signal.SIGINT, None)
            break
        except Exception as e:
            if attempt == retries:
                progress_group.update(task, description=f"[red]{name} ✗ ({e})[/red]")
            else:
                console.print(f"[yellow]{name}: Retry {attempt}/{retries}[/yellow]")
    
    active_downloads.remove((task, link_info))
    
def signal_handler(sig, frame):
    global active_downloads
    console.print("\n[bold yellow]Ctrl+C detected. Current downloads:[/bold yellow]")
    table = Table()
    table.add_column("No.", justify="right")
    table.add_column("File Name")
    for idx, (task, link_info) in enumerate(active_downloads):
        table.add_row(str(idx + 1), link_info['name'])
    console.print(table)
    choices = Prompt.ask("Enter the numbers of downloads to cancel (e.g., 1-3,5)", default="")
    cancel_indices = parse_number_ranges(choices)
    for idx, (task, link_info) in enumerate(active_downloads):
        if (idx + 1) in cancel_indices:
            progress_group.update(task, description=f"[red]{link_info['name']} ✗ (Cancelled)[/red]")
            # Terminate the process if it's still running
            if link_info.get('process'):
                link_info['process'].terminate()
    console.print("[bold red]Cancelling selected downloads...[/bold red]")

def main():
    global progress_group
    try:
        console.print("[bold blue]M3U Batch Downloader for AniLINK[/bold blue]")
        check_ffmpeg()
    
        file_path = Prompt.ask("Path to your M3U file")
        file_path = sanitize_path(file_path)  # Sanitize the file path
        default_folder = os.path.splitext(os.path.basename(file_path))[0]
        links = parse_m3u(file_path)
        if not links:
            console.print("[red]No links found in M3U file.[/red]")
            return
    
        folder = get_download_folder(default_folder)
    
        settings = load_settings()
        change_settings = Confirm.ask("Do you want to customize settings?", default=False)
        if change_settings:
            settings = customize_settings(settings)
        
        links = check_existing_files(links, folder)
        if not links:
            console.print("[bold green]No files to download.[/bold green]")
            return
    
        console.print("\n[bold]Starting downloads...[/bold]\n")
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(bar_width=80),
            TextColumn("[progress.percentage]{task.percentage:>5.2f}%"),
            # TextColumn("[blue]{task.fields[filename]}"),
            expand=True
        ) as progress:
            progress_group = progress
            threads = []
            semaphore = threading.Semaphore(settings['parallel_downloads'])
            for idx, link_info in enumerate(links):
                semaphore.acquire()
                thread = threading.Thread(
                    target=lambda sem, ln, i: (download_stream(ln, folder, progress, settings, links, i), sem.release()),
                    args=(semaphore, link_info, idx)
                )
                threads.append(thread)
                thread.start()
            for thread in threads:
                thread.join()
            
        console.print("\n[bold green]All downloads completed![/bold green]")
    except Exception as e:
        console.print(f"\n[red]An unexpected error occurred: {e}[/red]\n")

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    
    while True:
        console.clear()
        main()
        process_another = Confirm.ask("\n\nDo you want to process another M3U file?", default=False)
        if not process_another:
            break
        else:
            console.clear()
            console.clear_live()