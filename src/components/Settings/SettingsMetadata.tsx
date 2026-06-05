import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import MetadataSelector, {
  MetadataProviderType,
} from '@app/components/MetadataSelector';
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
  metadataProviderSettings: 'Metadata Providers',
  general: 'General',
  settings: 'Settings',
  seriesMetadataProvider: 'Series metadata provider',
  animeMetadataProvider: 'Anime metadata provider',
  metadataSettings: 'Settings for metadata provider',
  clickTest:
    'Click on the "Test" button to check connectivity with metadata providers',
  notTested: 'Not Tested',
  failed: 'Does not work',
  operational: 'Operational',
  providerStatus: 'Metadata Provider Status',
  chooseProvider: 'Choose metadata providers for different content types',
  metadataProviderSelection: 'Metadata Provider Selection',
  tmdbProviderDoesnotWork:
    'TMDB provider does not work, please select another metadata provider',
  tvdbProviderDoesnotWork:
    'TVDB provider does not work, please select another metadata provider',
  allChosenProvidersAreOperational:
    'All chosen metadata providers are operational',
  connectionTestFailed: 'Connection test failed',
  failedToSaveMetadataSettings: 'Failed to save metadata provider settings',
  metadataSettingsSaved: 'Metadata provider settings saved',
  metadataProviderConfiguration: 'Metadata Provider Configuration',
  metadataProviderConfigurationDescription:
    'Configure connection settings for the metadata providers used by music. Point these at self-hosted mirrors to bypass public rate limits.',
  musicbrainz: 'MusicBrainz',
  listenbrainz: 'ListenBrainz',
  baseUrl: 'Base URL',
  apiBaseUrl: 'API base URL',
  webBaseUrl: 'Web base URL',
  userAgent: 'User-Agent',
  maxRPS: 'Max requests per second',
  authToken: 'Auth token',
  userToken: 'User token',
  musicMetadataSaved: 'Music metadata settings saved',
  musicMetadataSaveFailed: 'Failed to save music metadata settings',
});

type ProviderStatus = 'ok' | 'not tested' | 'failed';

interface ProviderResponse {
  tvdb: ProviderStatus;
  tmdb: ProviderStatus;
  musicbrainz: ProviderStatus;
  listenbrainz: ProviderStatus;
}

interface MetadataValues {
  tv: MetadataProviderType;
  anime: MetadataProviderType;
}

interface MetadataSettings {
  metadata: MetadataValues;
}

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

const mapStatusValue = (status: string): ProviderStatus => {
  if (status === 'ok') return 'ok';
  if (status === 'failed') return 'failed';
  return 'not tested';
};

const SettingsMetadata = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);
  const defaultStatus: ProviderResponse = {
    tmdb: 'not tested',
    tvdb: 'not tested',
    musicbrainz: 'not tested',
    listenbrainz: 'not tested',
  };

  const [providerStatus, setProviderStatus] =
    useState<ProviderResponse>(defaultStatus);

  const { data, error } = useSWR<MetadataSettings>(
    '/api/v1/settings/metadatas',
    async (url: string) => {
      const response = await axios.get<{
        tv: MetadataProviderType;
        anime: MetadataProviderType;
      }>(url);

      return {
        metadata: {
          tv: response.data.tv,
          anime: response.data.anime,
        },
      };
    }
  );

  const { data: musicData, mutate: mutateMusic } =
    useSWR<MusicMetadataSettings>('/api/v1/settings/music-metadata');

  const testConnection = async (
    values: MetadataValues
  ): Promise<ProviderResponse> => {
    const useTmdb =
      values.tv === MetadataProviderType.TMDB ||
      values.anime === MetadataProviderType.TMDB;
    const useTvdb =
      values.tv === MetadataProviderType.TVDB ||
      values.anime === MetadataProviderType.TVDB;

    const tvDbTmdbPromise = axios
      .post<{
        success: boolean;
        tests: { tvdb: ProviderStatus; tmdb: ProviderStatus };
      }>('/api/v1/settings/metadatas/test', { tmdb: useTmdb, tvdb: useTvdb })
      .then((r) => r.data.tests)
      .catch((e) => {
        if (axios.isAxiosError(e) && e.response?.data?.tests) {
          return e.response.data.tests as {
            tvdb: ProviderStatus;
            tmdb: ProviderStatus;
          };
        }
        return { tvdb: 'failed' as const, tmdb: 'failed' as const };
      });

    const musicPromise = axios
      .post<{
        success: boolean;
        tests: {
          musicbrainz: ProviderStatus;
          listenbrainz: ProviderStatus;
        };
      }>('/api/v1/settings/music-metadata/test')
      .then((r) => r.data.tests)
      .catch((e) => {
        if (axios.isAxiosError(e) && e.response?.data?.tests) {
          return e.response.data.tests as {
            musicbrainz: ProviderStatus;
            listenbrainz: ProviderStatus;
          };
        }
        return {
          musicbrainz: 'failed' as const,
          listenbrainz: 'failed' as const,
        };
      });

    const [tvdbTmdb, music] = await Promise.all([
      tvDbTmdbPromise,
      musicPromise,
    ]);

    const newStatus: ProviderResponse = {
      tmdb: useTmdb ? mapStatusValue(tvdbTmdb.tmdb) : 'not tested',
      tvdb: useTvdb ? mapStatusValue(tvdbTmdb.tvdb) : 'not tested',
      musicbrainz: mapStatusValue(music.musicbrainz),
      listenbrainz: mapStatusValue(music.listenbrainz),
    };

    setProviderStatus(newStatus);
    return newStatus;
  };

  const saveSettings = async (
    values: MetadataValues
  ): Promise<MetadataSettings> => {
    try {
      const response = await axios.put<{
        success: boolean;
        tv: MetadataProviderType;
        anime: MetadataProviderType;
        tests?: { tvdb: ProviderStatus; tmdb: ProviderStatus };
      }>('/api/v1/settings/metadatas', {
        tv: values.tv,
        anime: values.anime,
      });

      if (response.data.tests) {
        setProviderStatus((prev) => ({
          ...prev,
          tmdb: mapStatusValue(response.data.tests!.tmdb),
          tvdb: mapStatusValue(response.data.tests!.tvdb),
        }));
      }

      return {
        metadata: {
          tv: response.data.tv,
          anime: response.data.anime,
        },
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        const errorData = error.response.data as {
          success: boolean;
          tests?: { tvdb: string; tmdb: string };
        };
        if (errorData.tests) {
          setProviderStatus((prev) => ({
            ...prev,
            tmdb: mapStatusValue(errorData.tests!.tmdb),
            tvdb: mapStatusValue(errorData.tests!.tvdb),
          }));
        }
      }
      throw new Error('Failed to save Metadata settings', { cause: error });
    }
  };

  const getStatusClass = (status: ProviderStatus): string => {
    switch (status) {
      case 'ok':
        return 'text-green-500';
      case 'not tested':
        return 'text-yellow-500';
      case 'failed':
        return 'text-red-500';
    }
  };

  const getStatusMessage = (status: ProviderStatus): string => {
    switch (status) {
      case 'ok':
        return intl.formatMessage(messages.operational);
      case 'not tested':
        return intl.formatMessage(messages.notTested);
      case 'failed':
        return intl.formatMessage(messages.failed);
    }
  };

  const getBadgeType = (
    status: ProviderStatus
  ):
    | 'default'
    | 'primary'
    | 'danger'
    | 'warning'
    | 'success'
    | 'dark'
    | 'light'
    | undefined => {
    switch (status) {
      case 'ok':
        return 'success';
      case 'not tested':
        return 'warning';
      case 'failed':
        return 'danger';
    }
  };

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  const initialValues: MetadataValues = data?.metadata || {
    tv: MetadataProviderType.TMDB,
    anime: MetadataProviderType.TMDB,
  };

  const musicInitialValues: MusicMetadataSettings = musicData ?? {
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
          intl.formatMessage(messages.general),
          intl.formatMessage(globalMessages.settings),
        ]}
      />

      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.metadataProviderSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.metadataSettings)}
        </p>
      </div>

      <div className="mb-6 rounded-lg bg-gray-800 p-4">
        <h4 className="mb-3 text-lg font-medium">
          {intl.formatMessage(messages.providerStatus)}
        </h4>
        <div className="flex flex-col space-y-3">
          <div className="flex items-center">
            <span className="mr-2 w-32">TheMovieDB:</span>
            <span
              className={`text-sm ${getStatusClass(providerStatus.tmdb)}`}
              data-testid="tmdb-status-container"
            >
              <Badge badgeType={getBadgeType(providerStatus.tmdb)}>
                {getStatusMessage(providerStatus.tmdb)}
              </Badge>
            </span>
          </div>
          <div className="flex items-center">
            <span className="mr-2 w-32">TheTVDB:</span>
            <span
              className={`text-sm ${getStatusClass(providerStatus.tvdb)}`}
              data-testid="tvdb-status"
            >
              <Badge badgeType={getBadgeType(providerStatus.tvdb)}>
                {getStatusMessage(providerStatus.tvdb)}
              </Badge>
            </span>
          </div>
          <div className="flex items-center">
            <span className="mr-2 w-32">MusicBrainz:</span>
            <span
              className={`text-sm ${getStatusClass(providerStatus.musicbrainz)}`}
              data-testid="musicbrainz-status"
            >
              <Badge badgeType={getBadgeType(providerStatus.musicbrainz)}>
                {getStatusMessage(providerStatus.musicbrainz)}
              </Badge>
            </span>
          </div>
          <div className="flex items-center">
            <span className="mr-2 w-32">ListenBrainz:</span>
            <span
              className={`text-sm ${getStatusClass(providerStatus.listenbrainz)}`}
              data-testid="listenbrainz-status"
            >
              <Badge badgeType={getBadgeType(providerStatus.listenbrainz)}>
                {getStatusMessage(providerStatus.listenbrainz)}
              </Badge>
            </span>
          </div>
        </div>
      </div>

      <div className="section">
        <Formik
          initialValues={{ metadata: initialValues }}
          onSubmit={async (values) => {
            try {
              const result = await saveSettings(values.metadata);

              if (data) {
                data.metadata = result.metadata;
              }

              addToast(intl.formatMessage(messages.metadataSettingsSaved), {
                appearance: 'success',
                autoDismiss: true,
              });
            } catch {
              addToast(
                intl.formatMessage(messages.failedToSaveMetadataSettings),
                {
                  appearance: 'error',
                  autoDismiss: true,
                }
              );
            }
          }}
        >
          {({ isSubmitting, isValid, values, setFieldValue }) => {
            return (
              <Form className="section" data-testid="settings-main-form">
                <div className="mb-6">
                  <h2 className="heading">
                    {intl.formatMessage(messages.metadataProviderSelection)}
                  </h2>
                  <p className="description">
                    {intl.formatMessage(messages.chooseProvider)}
                  </p>
                </div>

                <div className="form-row">
                  <label
                    htmlFor="tv-metadata-provider"
                    className="checkbox-label"
                  >
                    <span className="mr-2">
                      {intl.formatMessage(messages.seriesMetadataProvider)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <MetadataSelector
                      testId="tv-metadata-provider-selector"
                      value={values.metadata.tv}
                      onChange={(value) => setFieldValue('metadata.tv', value)}
                      isDisabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <label
                    htmlFor="anime-metadata-provider"
                    className="checkbox-label"
                  >
                    <span className="mr-2">
                      {intl.formatMessage(messages.animeMetadataProvider)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <MetadataSelector
                      testId="anime-metadata-provider-selector"
                      value={values.metadata.anime}
                      onChange={(value) =>
                        setFieldValue('metadata.anime', value)
                      }
                      isDisabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="actions">
                  <div className="flex justify-end">
                    <span className="ml-3 inline-flex rounded-md shadow-sm">
                      <Button
                        buttonType="warning"
                        type="button"
                        disabled={isSubmitting || !isValid}
                        onClick={async () => {
                          setIsTesting(true);
                          try {
                            const resp = await testConnection(values.metadata);

                            if (resp.tvdb === 'failed') {
                              addToast(
                                intl.formatMessage(
                                  messages.tvdbProviderDoesnotWork
                                ),
                                { appearance: 'error', autoDismiss: true }
                              );
                            } else if (resp.tmdb === 'failed') {
                              addToast(
                                intl.formatMessage(
                                  messages.tmdbProviderDoesnotWork
                                ),
                                { appearance: 'error', autoDismiss: true }
                              );
                            } else {
                              addToast(
                                intl.formatMessage(
                                  messages.allChosenProvidersAreOperational
                                ),
                                { appearance: 'success', autoDismiss: true }
                              );
                            }
                          } catch {
                            addToast(
                              intl.formatMessage(messages.connectionTestFailed),
                              { appearance: 'error', autoDismiss: true }
                            );
                          } finally {
                            setIsTesting(false);
                          }
                        }}
                      >
                        <BeakerIcon />
                        <span>
                          {isTesting
                            ? intl.formatMessage(globalMessages.testing)
                            : intl.formatMessage(globalMessages.test)}
                        </span>
                      </Button>
                    </span>

                    <span className="ml-3 inline-flex rounded-md shadow-sm">
                      <Button
                        data-testid="metadata-save-button"
                        buttonType="primary"
                        type="submit"
                        disabled={isSubmitting || !isValid || isTesting}
                      >
                        <ArrowDownOnSquareIcon />
                        <span>
                          {isSubmitting
                            ? intl.formatMessage(globalMessages.saving)
                            : intl.formatMessage(globalMessages.save)}
                        </span>
                      </Button>
                    </span>
                  </div>
                </div>
              </Form>
            );
          }}
        </Formik>
      </div>

      <div className="section">
        <div className="mb-6">
          <h2 className="heading">
            {intl.formatMessage(messages.metadataProviderConfiguration)}
          </h2>
          <p className="description">
            {intl.formatMessage(
              messages.metadataProviderConfigurationDescription
            )}
          </p>
        </div>

        <Formik
          initialValues={musicInitialValues}
          enableReinitialize
          onSubmit={async (values) => {
            try {
              await axios.put('/api/v1/settings/music-metadata', values);
              await mutateMusic();
              addToast(intl.formatMessage(messages.musicMetadataSaved), {
                appearance: 'success',
                autoDismiss: true,
              });
            } catch {
              addToast(intl.formatMessage(messages.musicMetadataSaveFailed), {
                appearance: 'error',
                autoDismiss: true,
              });
            }
          }}
        >
          {({ isSubmitting, isValid }) => (
            <Form className="section">
              <div className="mb-4 mt-2">
                <h4 className="heading">
                  {intl.formatMessage(messages.musicbrainz)}
                </h4>
              </div>

              <div className="form-row">
                <label htmlFor="musicbrainz.baseUrl" className="text-label">
                  {intl.formatMessage(messages.baseUrl)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      id="musicbrainz.baseUrl"
                      name="musicbrainz.baseUrl"
                      type="text"
                    />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="musicbrainz.userAgent" className="text-label">
                  {intl.formatMessage(messages.userAgent)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      id="musicbrainz.userAgent"
                      name="musicbrainz.userAgent"
                      type="text"
                    />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="musicbrainz.maxRPS" className="text-label">
                  {intl.formatMessage(messages.maxRPS)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      id="musicbrainz.maxRPS"
                      name="musicbrainz.maxRPS"
                      type="number"
                      min={1}
                    />
                  </div>
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

              <div className="mb-4 mt-8">
                <h4 className="heading">
                  {intl.formatMessage(messages.listenbrainz)}
                </h4>
              </div>

              <div className="form-row">
                <label htmlFor="listenbrainz.apiBaseUrl" className="text-label">
                  {intl.formatMessage(messages.apiBaseUrl)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      id="listenbrainz.apiBaseUrl"
                      name="listenbrainz.apiBaseUrl"
                      type="text"
                    />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="listenbrainz.webBaseUrl" className="text-label">
                  {intl.formatMessage(messages.webBaseUrl)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      id="listenbrainz.webBaseUrl"
                      name="listenbrainz.webBaseUrl"
                      type="text"
                    />
                  </div>
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
                      buttonType="primary"
                      type="submit"
                      disabled={isSubmitting || !isValid}
                    >
                      <ArrowDownOnSquareIcon />
                      <span>
                        {isSubmitting
                          ? intl.formatMessage(globalMessages.saving)
                          : intl.formatMessage(globalMessages.save)}
                      </span>
                    </Button>
                  </span>
                </div>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </>
  );
};

export default SettingsMetadata;
