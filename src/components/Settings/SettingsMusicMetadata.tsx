import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownOnSquareIcon, BeakerIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Settings', {
    musicMetadataProviderSettings: 'Music Metadata Providers',
    musicMetadataDescription:
        'Configure connection settings for MusicBrainz and ListenBrainz. Point these at self-hosted mirrors to bypass public rate limits.',
    musicbrainz: 'MusicBrainz',
    listenbrainz: 'ListenBrainz',
    baseUrl: 'Base URL',
    apiBaseUrl: 'API base URL',
    webBaseUrl: 'Web base URL',
    userAgent: 'User-Agent',
    maxRPS: 'Max requests per second',
    authToken: 'Auth token',
    userToken: 'User token',
    test: 'Test',
    save: 'Save changes',
    saving: 'Saving…',
    testing: 'Testing…',
    saved: 'Music metadata settings saved',
    saveFailed: 'Failed to save music metadata settings',
    providerStatus: 'Provider Status',
    notTested: 'Not Tested',
    failed: 'Does not work',
    operational: 'Operational',
});

type ProviderStatus = 'ok' | 'not tested' | 'failed';

interface MusicBrainzSettings {
    baseUrl: string;
    userAgent: string;
    authToken: string;
    maxRPS: number;
}

interface ListenBrainzSettings {
    apiBaseUrl: string;
    webBaseUrl: string;
    userToken: string;
}

interface MusicMetadataSettings {
    musicbrainz: MusicBrainzSettings;
    listenbrainz: ListenBrainzSettings;
}

const SettingsMusicMetadata = () => {
    const intl = useIntl();
    const { addToast } = useToasts();
    const [isTesting, setIsTesting] = useState(false);
    const [status, setStatus] = useState<{
        musicbrainz: ProviderStatus;
        listenbrainz: ProviderStatus;
    }>({ musicbrainz: 'not tested', listenbrainz: 'not tested' });

    const { data, error, mutate } = useSWR<MusicMetadataSettings>(
        '/api/v1/settings/music-metadata'
    );

    const getStatusClass = (s: ProviderStatus) =>
        s === 'ok'
            ? 'text-green-500'
            : s === 'failed'
                ? 'text-red-500'
                : 'text-yellow-500';

    const getStatusLabel = (s: ProviderStatus) =>
        s === 'ok'
            ? intl.formatMessage(messages.operational)
            : s === 'failed'
                ? intl.formatMessage(messages.failed)
                : intl.formatMessage(messages.notTested);

    const getBadge = (s: ProviderStatus) =>
        s === 'ok' ? 'success' : s === 'failed' ? 'danger' : 'warning';

    if (!data && !error) {
        return <LoadingSpinner />;
    }

    const initialValues: MusicMetadataSettings = data ?? {
        musicbrainz: {
            baseUrl: 'https://musicbrainz.org/ws/2',
            userAgent: 'Seerr (https://github.com/seerr-team/seerr)',
            authToken: '',
            maxRPS: 1,
        },
        listenbrainz: {
            apiBaseUrl: 'https://api.listenbrainz.org/1',
            webBaseUrl: 'https://listenbrainz.org',
            userToken: '',
        },
    };

    return (
        <>
            <PageTitle
                title={[
                    intl.formatMessage(messages.musicMetadataProviderSettings),
                    intl.formatMessage(globalMessages.settings),
                ]}
            />

            <div className="mb-6">
                <h3 className="heading">
                    {intl.formatMessage(messages.musicMetadataProviderSettings)}
                </h3>
                <p className="description">
                    {intl.formatMessage(messages.musicMetadataDescription)}
                </p>
            </div>

            <div className="mb-6 rounded-lg bg-gray-800 p-4">
                <h4 className="mb-3 text-lg font-medium">
                    {intl.formatMessage(messages.providerStatus)}
                </h4>
                <div className="flex flex-col space-y-3">
                    <div className="flex items-center">
                        <span className="mr-2 w-32">MusicBrainz:</span>
                        <span className={`text-sm ${getStatusClass(status.musicbrainz)}`}>
                            <Badge badgeType={getBadge(status.musicbrainz)}>
                                {getStatusLabel(status.musicbrainz)}
                            </Badge>
                        </span>
                    </div>
                    <div className="flex items-center">
                        <span className="mr-2 w-32">ListenBrainz:</span>
                        <span className={`text-sm ${getStatusClass(status.listenbrainz)}`}>
                            <Badge badgeType={getBadge(status.listenbrainz)}>
                                {getStatusLabel(status.listenbrainz)}
                            </Badge>
                        </span>
                    </div>
                </div>
            </div>

            <Formik
                initialValues={initialValues}
                enableReinitialize
                onSubmit={async (values) => {
                    try {
                        await axios.put('/api/v1/settings/music-metadata', values);
                        await mutate();
                        addToast(intl.formatMessage(messages.saved), {
                            appearance: 'success',
                            autoDismiss: true,
                        });
                    } catch {
                        addToast(intl.formatMessage(messages.saveFailed), {
                            appearance: 'error',
                            autoDismiss: true,
                        });
                    }
                }}
            >
                {({ isSubmitting, isValid }) => (
                    <Form className="section">
                        <div className="mb-6">
                            <h4 className="heading">
                                {intl.formatMessage(messages.musicbrainz)}
                            </h4>
                        </div>

                        <div className="form-row">
                            <label htmlFor="musicbrainz.baseUrl" className="text-label">
                                {intl.formatMessage(messages.baseUrl)}
                            </label>
                            <div className="form-input-area">
                                <Field
                                    id="musicbrainz.baseUrl"
                                    name="musicbrainz.baseUrl"
                                    type="text"
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <label htmlFor="musicbrainz.userAgent" className="text-label">
                                {intl.formatMessage(messages.userAgent)}
                            </label>
                            <div className="form-input-area">
                                <Field
                                    id="musicbrainz.userAgent"
                                    name="musicbrainz.userAgent"
                                    type="text"
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <label htmlFor="musicbrainz.maxRPS" className="text-label">
                                {intl.formatMessage(messages.maxRPS)}
                            </label>
                            <div className="form-input-area">
                                <Field
                                    id="musicbrainz.maxRPS"
                                    name="musicbrainz.maxRPS"
                                    type="number"
                                    min={1}
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <label htmlFor="musicbrainz.authToken" className="text-label">
                                {intl.formatMessage(messages.authToken)}
                            </label>
                            <div className="form-input-area">
                                <div className="form-input-field">
                                    <SensitiveInput
                                        as="field"
                                        id="musicbrainz.authToken"
                                        name="musicbrainz.authToken"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mb-6 mt-8">
                            <h4 className="heading">
                                {intl.formatMessage(messages.listenbrainz)}
                            </h4>
                        </div>

                        <div className="form-row">
                            <label htmlFor="listenbrainz.apiBaseUrl" className="text-label">
                                {intl.formatMessage(messages.apiBaseUrl)}
                            </label>
                            <div className="form-input-area">
                                <Field
                                    id="listenbrainz.apiBaseUrl"
                                    name="listenbrainz.apiBaseUrl"
                                    type="text"
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <label htmlFor="listenbrainz.webBaseUrl" className="text-label">
                                {intl.formatMessage(messages.webBaseUrl)}
                            </label>
                            <div className="form-input-area">
                                <Field
                                    id="listenbrainz.webBaseUrl"
                                    name="listenbrainz.webBaseUrl"
                                    type="text"
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <label htmlFor="listenbrainz.userToken" className="text-label">
                                {intl.formatMessage(messages.userToken)}
                            </label>
                            <div className="form-input-area">
                                <div className="form-input-field">
                                    <SensitiveInput
                                        as="field"
                                        id="listenbrainz.userToken"
                                        name="listenbrainz.userToken"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="actions">
                            <div className="flex justify-end">
                                <span className="ml-3 inline-flex rounded-md shadow-sm">
                                    <Button
                                        buttonType="warning"
                                        type="button"
                                        disabled={isSubmitting || isTesting}
                                        onClick={async () => {
                                            setIsTesting(true);
                                            try {
                                                const resp = await axios.post<{
                                                    success: boolean;
                                                    tests: {
                                                        musicbrainz: ProviderStatus;
                                                        listenbrainz: ProviderStatus;
                                                    };
                                                }>('/api/v1/settings/music-metadata/test');
                                                setStatus(resp.data.tests);
                                            } catch (e) {
                                                if (axios.isAxiosError(e) && e.response?.data?.tests) {
                                                    setStatus(e.response.data.tests);
                                                }
                                            } finally {
                                                setIsTesting(false);
                                            }
                                        }}
                                    >
                                        <BeakerIcon />
                                        <span>
                                            {isTesting
                                                ? intl.formatMessage(messages.testing)
                                                : intl.formatMessage(messages.test)}
                                        </span>
                                    </Button>
                                </span>
                                <span className="ml-3 inline-flex rounded-md shadow-sm">
                                    <Button
                                        buttonType="primary"
                                        type="submit"
                                        disabled={isSubmitting || !isValid}
                                    >
                                        <ArrowDownOnSquareIcon />
                                        <span>
                                            {isSubmitting
                                                ? intl.formatMessage(messages.saving)
                                                : intl.formatMessage(messages.save)}
                                        </span>
                                    </Button>
                                </span>
                            </div>
                        </div>
                    </Form>
                )}
            </Formik>
        </>
    );
};

export default SettingsMusicMetadata;
