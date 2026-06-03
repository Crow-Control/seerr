import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsMusicMetadata from '@app/components/Settings/SettingsMusicMetadata';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const MusicMetadataSettingsPage: NextPage = () => {
    useRouteGuard(Permission.ADMIN);
    return (
        <SettingsLayout>
            <SettingsMusicMetadata />
        </SettingsLayout>
    );
};

export default MusicMetadataSettingsPage;
