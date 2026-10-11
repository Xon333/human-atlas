#!/usr/bin/env python3
"""Activate or roll back the prepared regional Atlas release on OMV.

Consumes the private deployment dossier; never prepares builds or edits SpaceO.
The operator must already have authorization for a service cutover.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

UNITS = ('human-atlas-runtime.service', 'human-atlas.service')
DROPIN = Path.home() / '.config/systemd/user/human-atlas-runtime.service.d/99-regional-atlas.conf'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def systemctl(*args):
    return subprocess.check_output(
        ['systemctl', '--user', *args], text=True,
        env={**os.environ, 'XDG_RUNTIME_DIR': f'/run/user/{os.getuid()}'})


def properties(unit):
    result = {}
    for line in systemctl('show', unit, '-p',
                          'WorkingDirectory,EnvironmentFiles,DropInPaths,ActiveState,SubState').splitlines():
        key, value = line.split('=', 1)
        # systemctl prints one EnvironmentFiles= line per file, in precedence order.
        result[key] = result[key] + ' ' + value if key in result else value
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('check', 'activate', 'rollback'))
    parser.add_argument('--deployment', type=Path, required=True)
    args = parser.parse_args()
    root = args.deployment
    require(root.is_absolute(), 'Deployment path must be absolute')
    read = lambda name: json.loads((root / name).read_text())
    release = Path(read('source.json')['release'])
    require(release.is_relative_to(root) and release.is_dir(), 'Release must belong to this dossier')
    course = read('course-identity.json')
    recovery = read('recovery.json')
    require(sha(root / 'course.json') == course['sha256'], 'Candidate export changed')
    require(sha(Path(recovery['acceptedCoursePath'])) == recovery['acceptedCourseSha256'], 'Accepted export changed; resolve before cutover or rollback')
    require((root / 'runtime.env').read_text() == f'ATLAS_COURSE_FILE={root / "course.json"}\n', 'Unexpected candidate environment')
    for name, expected in read('preserved-controls.json').items():
        require(sha(Path(name)) == expected, f'Preserved control changed: {name}')
    manifest = read('release-manifest.json')
    files = {str(p.relative_to(release)): p for p in release.rglob('*') if p.is_file()}
    require(files.keys() == manifest.keys(), 'Release file set changed')
    for name, path in files.items():
        require(not path.is_symlink() and sha(path) == manifest[name]['sha256'], f'Release changed: {name}')
    expected = (f'# Regional Atlas {read("source.json")["commit"]}; preserve accepted overrides.\n'
                f'[Service]\nWorkingDirectory={release}\nEnvironmentFile={root / "runtime.env"}\n')
    installed = DROPIN.exists()
    require(not installed or DROPIN.read_text() == expected, 'Unrecognized regional override; leave it untouched')
    for unit in UNITS:
        before = read(unit + '.before.json')
        current = properties(unit)
        expected_dropins = before['DropInPaths'].split()
        if installed and unit == UNITS[0]:
            expected_dropins.append(str(DROPIN))
        require(current['DropInPaths'].split() == expected_dropins, f'Loaded drop-ins differ: {unit}')
        disk_dropins = sorted(str(p) for p in (DROPIN.parent.parent / (unit + '.d')).glob('*.conf'))
        require(disk_dropins == sorted(expected_dropins), f'On-disk drop-ins differ: {unit}')
        for key in ('WorkingDirectory', 'EnvironmentFiles'):
            value = before.get(key, '')
            if installed and unit == UNITS[0]:
                value = str(release) if key == 'WorkingDirectory' else value + f' {root / "runtime.env"} (ignore_errors=no)'
            require(current.get(key, '') == value, f'Unexpected {unit} {key}')
    if args.action == 'check':
        print(json.dumps({'status': 'passed', 'regionalOverrideInstalled': installed}))
        return
    require(installed == (args.action == 'rollback'), 'Requested transition is already applied')
    # All guards precede mutation. Preserve any partial-operation receipt for diagnosis.
    receipt = root / f'{args.action}-receipt.json'
    require(not receipt.exists(), 'Operation receipt already exists; inspect it before another transition')
    state = {'action': args.action, 'phase': 'validated', 'commit': read('source.json')['commit']}
    def record(phase):
        state['phase'] = phase
        receipt.write_text(json.dumps(state, indent=2) + '\n')
    record('validated')
    if args.action == 'activate':
        with DROPIN.open('x') as output:
            output.write(expected)
        DROPIN.chmod(0o600)
    else:
        DROPIN.unlink()
    record('override-written' if args.action == 'activate' else 'override-removed')
    systemctl('daemon-reload')
    record('manager-reloaded')
    systemctl('restart', *UNITS)
    state['units'] = {unit: properties(unit) for unit in UNITS}
    require(all(value['ActiveState'] == 'active' and value['SubState'] == 'running'
                for value in state['units'].values()), 'Service restart incomplete')
    record('services-ready')
    print(json.dumps({'status': 'services-ready', 'action': args.action, 'receipt': str(receipt)}))


if __name__ == '__main__':
    main()
