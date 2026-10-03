import { useState } from "react";
import { Input } from "@ui/components/ui/input";
import { Button } from "@ui/components/ui/button";
import { Switch } from "@ui/components/ui/switch";
import { SettingsRow } from "../SettingsRow";
import {
    useGlobalSettings,
    useUpdateGlobalSetting,
} from "@core/api/useSettings";
import { useTestLinearConnection } from "@core/api/useLinear";
import { Eye, EyeOff, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export function IntegrationsSection() {
    const { data: settings } = useGlobalSettings();
    const { mutate: updateSetting } = useUpdateGlobalSetting();
    const testConnection = useTestLinearConnection();
    const [showKey, setShowKey] = useState(false);
    const [keyInput, setKeyInput] = useState<string | undefined>(undefined);

    if (!settings) return null;

    const displayKey = keyInput ?? settings.linearApiKey;
    const hasKey = displayKey.length > 0;
    const isDirty =
        keyInput !== undefined && keyInput !== settings.linearApiKey;

    function handleSaveKey() {
        if (keyInput === undefined) return;
        updateSetting({ key: "linearApiKey", value: keyInput });
        setKeyInput(undefined);
    }

    function handleTestConnection() {
        const key = keyInput ?? settings?.linearApiKey;
        if (!key) return;
        testConnection.mutate(key);
    }

    return (
        <div>
            <div
                className="animate-fade-in-up"
                style={{ animationDelay: "0ms" }}
            >
                <h1 className="text-lg font-semibold text-foreground">
                    Integrations
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    Connect external tools to import tasks automatically.
                </p>
            </div>

            <div className="mt-6">
                {/* Linear header */}
                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "50ms" }}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            fill="none"
                            viewBox="0 0 512 512"
                            className="rounded-[4px]"
                        >
                            <path fill="url(#a)" d="M0 0h512v512H0z" />
                            <g filter="url(#b)" opacity=".8">
                                <path
                                    fill="#fff"
                                    d="M346.112 342.268c1.674 1.674 4.369 1.77 6.112.168 58.502-53.763 61.2-148.753 4.505-205.448-56.694-56.695-151.684-53.996-205.447 4.505-1.602 1.743-1.506 4.439.168 6.113l194.662 194.662Z"
                                    shapeRendering="crispEdges"
                                    style={{ mixBlendMode: "multiply" }}
                                />
                            </g>
                            <g filter="url(#c)" opacity=".3">
                                <path
                                    fill="url(#d)"
                                    d="M346.112 342.268c1.674 1.674 4.369 1.77 6.112.168 58.502-53.763 61.2-148.753 4.505-205.448-56.694-56.695-151.684-53.996-205.447 4.505-1.602 1.743-1.506 4.439.168 6.113l194.662 194.662Z"
                                />
                            </g>
                            <g filter="url(#e)" opacity=".3">
                                <path
                                    fill="url(#f)"
                                    d="M261.607 324.792c2.441-1.434 2.844-4.786.912-6.855L126.121 171.95c-2.018-2.16-5.535-1.831-7.017.727a148.996 148.996 0 0 0-6.49 12.537c-.774 1.688-.389 3.673.926 4.984l137.088 136.598a4.513 4.513 0 0 0 4.985.944c2.702-1.176 4.021-1.79 5.994-2.948Z"
                                />
                            </g>
                            <path
                                fill="url(#g)"
                                d="M357.358 374.306c1.758 1.758 4.581 1.866 6.416.189a163.595 163.595 0 0 0 5.316-5.081c62.547-62.547 62.547-163.956 0-226.504-62.548-62.547-163.957-62.547-226.504 0a163.595 163.595 0 0 0-5.081 5.316c-1.677 1.835-1.569 4.658.189 6.416l219.664 219.664Z"
                            />
                            <path
                                fill="url(#h)"
                                d="M357.358 374.306c1.758 1.758 4.581 1.866 6.416.189a163.595 163.595 0 0 0 5.316-5.081c62.547-62.547 62.547-163.956 0-226.504-62.548-62.547-163.957-62.547-226.504 0a163.595 163.595 0 0 0-5.081 5.316c-1.677 1.835-1.569 4.658.189 6.416l219.664 219.664Z"
                            />
                            <path
                                fill="url(#i)"
                                d="M336.333 394.672c2.627-1.528 3.024-5.118.875-7.267L124.595 174.792c-2.149-2.149-5.739-1.752-7.267.875a158.87 158.87 0 0 0-7.119 13.725c-.811 1.771-.41 3.852.968 5.229l206.201 206.202c1.378 1.378 3.459 1.779 5.23.968a158.87 158.87 0 0 0 13.725-7.119Z"
                            />
                            <path
                                fill="url(#j)"
                                d="M336.333 394.672c2.627-1.528 3.024-5.118.875-7.267L124.595 174.792c-2.149-2.149-5.739-1.752-7.267.875a158.87 158.87 0 0 0-7.119 13.725c-.811 1.771-.41 3.852.968 5.229l206.201 206.202c1.378 1.378 3.459 1.779 5.23.968a158.87 158.87 0 0 0 13.725-7.119Z"
                            />
                            <path
                                fill="url(#k)"
                                d="M286.659 413.348c3.619-.707 4.86-5.136 2.253-7.743L106.395 223.088c-2.607-2.607-7.036-1.366-7.743 2.253a160.813 160.813 0 0 0-2.502 18.462 4.666 4.666 0 0 0 1.366 3.654l167.027 167.027a4.667 4.667 0 0 0 3.654 1.366 160.834 160.834 0 0 0 18.462-2.502Z"
                            />
                            <path
                                fill="url(#l)"
                                d="M286.659 413.348c3.619-.707 4.86-5.136 2.253-7.743L106.395 223.088c-2.607-2.607-7.036-1.366-7.743 2.253a160.813 160.813 0 0 0-2.502 18.462 4.666 4.666 0 0 0 1.366 3.654l167.027 167.027a4.667 4.667 0 0 0 3.654 1.366 160.834 160.834 0 0 0 18.462-2.502Z"
                            />
                            <path
                                fill="url(#m)"
                                d="M217.031 411.577c4.45 1.107 7.201-4.155 3.959-7.398L107.821 291.01c-3.243-3.242-8.504-.491-7.398 3.959 6.784 27.279 20.838 53.121 42.163 74.445 21.324 21.324 47.166 35.379 74.445 42.163Z"
                            />
                            <path
                                fill="url(#n)"
                                d="M217.031 411.577c4.45 1.107 7.201-4.155 3.959-7.398L107.821 291.01c-3.243-3.242-8.504-.491-7.398 3.959 6.784 27.279 20.838 53.121 42.163 74.445 21.324 21.324 47.166 35.379 74.445 42.163Z"
                            />
                            <path
                                stroke="#fff"
                                strokeOpacity=".5"
                                strokeWidth="5"
                                d="M362.088 372.649c-.816.746-2.119.733-2.963-.111L139.462 152.875c-.844-.844-.857-2.147-.111-2.963a160.661 160.661 0 0 1 5.003-5.234c61.571-61.57 161.397-61.57 222.968 0 61.571 61.571 61.571 161.397 0 222.968a160.661 160.661 0 0 1-5.234 5.003Zm-26.648 16.523c1.038 1.038.786 2.67-.364 3.34a156.562 156.562 0 0 1-13.51 7.006c-.794.364-1.761.197-2.42-.462L112.944 192.854c-.659-.659-.826-1.626-.462-2.42a156.562 156.562 0 0 1 7.006-13.51c.67-1.15 2.302-1.402 3.34-.364L335.44 389.172Zm-48.296 18.201c1.276 1.276.574 3.221-.964 3.521a158.269 158.269 0 0 1-18.175 2.463 2.167 2.167 0 0 1-1.694-.64L99.283 245.689a2.167 2.167 0 0 1-.64-1.694 158.313 158.313 0 0 1 2.463-18.175c.3-1.538 2.245-2.24 3.521-.964l182.517 182.517Zm-67.922-1.426c.81.81.812 1.735.464 2.391-.333.63-1.007 1.072-2.052.813-26.85-6.678-52.286-20.51-73.28-41.505-20.995-20.994-34.827-46.43-41.505-73.28-.259-1.045.183-1.719.813-2.052.656-.348 1.581-.346 2.391.464l113.169 113.169Z"
                                style={{ mixBlendMode: "soft-light" }}
                            />
                            <defs>
                                <linearGradient
                                    id="a"
                                    x1="256"
                                    x2="256"
                                    y1="0"
                                    y2="512"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#2D2E31" />
                                    <stop offset="1" stopColor="#0F1012" />
                                </linearGradient>
                                <linearGradient
                                    id="d"
                                    x1="256.306"
                                    x2="256.306"
                                    y1="95.332"
                                    y2="379.492"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#fff" />
                                    <stop offset="1" stopColor="#C5C5C5" />
                                </linearGradient>
                                <linearGradient
                                    id="f"
                                    x1="178.365"
                                    x2="178.365"
                                    y1="167.248"
                                    y2="351.126"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#fff" />
                                    <stop offset="1" stopColor="#C5C5C5" />
                                </linearGradient>
                                <linearGradient
                                    id="g"
                                    x1="256"
                                    x2="256"
                                    y1="96"
                                    y2="416"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#fff" />
                                    <stop offset="1" stopColor="#CCC" />
                                </linearGradient>
                                <linearGradient
                                    id="i"
                                    x1="256"
                                    x2="256"
                                    y1="96"
                                    y2="416"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#fff" />
                                    <stop offset="1" stopColor="#CCC" />
                                </linearGradient>
                                <linearGradient
                                    id="k"
                                    x1="256"
                                    x2="256"
                                    y1="96"
                                    y2="416"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#fff" />
                                    <stop offset="1" stopColor="#CCC" />
                                </linearGradient>
                                <linearGradient
                                    id="m"
                                    x1="256"
                                    x2="256"
                                    y1="96"
                                    y2="416"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#fff" />
                                    <stop offset="1" stopColor="#CCC" />
                                </linearGradient>
                                <radialGradient
                                    id="h"
                                    cx="0"
                                    cy="0"
                                    r="1"
                                    gradientTransform="matrix(0 320 -320 0 256 96)"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#fff" />
                                    <stop
                                        offset=".598"
                                        stopColor="#fff"
                                        stopOpacity="0"
                                    />
                                </radialGradient>
                                <radialGradient
                                    id="j"
                                    cx="0"
                                    cy="0"
                                    r="1"
                                    gradientTransform="matrix(0 320 -320 0 256 96)"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#fff" />
                                    <stop
                                        offset=".598"
                                        stopColor="#fff"
                                        stopOpacity="0"
                                    />
                                </radialGradient>
                                <radialGradient
                                    id="l"
                                    cx="0"
                                    cy="0"
                                    r="1"
                                    gradientTransform="matrix(0 320 -320 0 256 96)"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#fff" />
                                    <stop
                                        offset=".598"
                                        stopColor="#fff"
                                        stopOpacity="0"
                                    />
                                </radialGradient>
                                <radialGradient
                                    id="n"
                                    cx="0"
                                    cy="0"
                                    r="1"
                                    gradientTransform="matrix(0 320 -320 0 256 96)"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#fff" />
                                    <stop
                                        offset=".598"
                                        stopColor="#fff"
                                        stopOpacity="0"
                                    />
                                </radialGradient>
                                <filter
                                    id="b"
                                    width="295.583"
                                    height="295.582"
                                    x="126.135"
                                    y="66.88"
                                    colorInterpolationFilters="sRGB"
                                    filterUnits="userSpaceOnUse"
                                >
                                    <feFlood
                                        floodOpacity="0"
                                        result="BackgroundImageFix"
                                    />
                                    <feColorMatrix
                                        in="SourceAlpha"
                                        result="hardAlpha"
                                        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                                    />
                                    <feOffset dy="-5.12" />
                                    <feGaussianBlur stdDeviation="12" />
                                    <feComposite
                                        in2="hardAlpha"
                                        operator="out"
                                    />
                                    <feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0" />
                                    <feBlend
                                        in2="BackgroundImageFix"
                                        mode="plus-lighter"
                                        result="effect1_dropShadow_14134_4654"
                                    />
                                    <feBlend
                                        in="SourceGraphic"
                                        in2="effect1_dropShadow_14134_4654"
                                        result="shape"
                                    />
                                </filter>
                                <filter
                                    id="c"
                                    width="267.583"
                                    height="267.582"
                                    x="140.135"
                                    y="86"
                                    colorInterpolationFilters="sRGB"
                                    filterUnits="userSpaceOnUse"
                                >
                                    <feFlood
                                        floodOpacity="0"
                                        result="BackgroundImageFix"
                                    />
                                    <feBlend
                                        in="SourceGraphic"
                                        in2="BackgroundImageFix"
                                        result="shape"
                                    />
                                    <feGaussianBlur
                                        result="effect1_foregroundBlur_14134_4654"
                                        stdDeviation="5"
                                    />
                                </filter>
                                <filter
                                    id="e"
                                    width="171.522"
                                    height="177.592"
                                    x="102.218"
                                    y="160.522"
                                    colorInterpolationFilters="sRGB"
                                    filterUnits="userSpaceOnUse"
                                >
                                    <feFlood
                                        floodOpacity="0"
                                        result="BackgroundImageFix"
                                    />
                                    <feBlend
                                        in="SourceGraphic"
                                        in2="BackgroundImageFix"
                                        result="shape"
                                    />
                                    <feGaussianBlur
                                        result="effect1_foregroundBlur_14134_4654"
                                        stdDeviation="5"
                                    />
                                </filter>
                            </defs>
                        </svg>
                        <h2 className="text-sm font-semibold text-foreground">
                            Linear
                        </h2>
                    </div>
                    <p className="text-[13px] text-muted-foreground mb-4">
                        Import issues from Linear and let SUSTN work through
                        them automatically.
                    </p>
                </div>

                {/* Enable toggle */}
                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "100ms" }}
                >
                    <SettingsRow
                        label="Enable Linear integration"
                        sublabel="When enabled, you can sync Linear issues as tasks in your projects."
                    >
                        <Switch
                            checked={settings.linearEnabled}
                            onCheckedChange={(checked) =>
                                updateSetting({
                                    key: "linearEnabled",
                                    value: checked,
                                })
                            }
                        />
                    </SettingsRow>
                </div>

                {/* API Key */}
                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "150ms" }}
                >
                    <SettingsRow
                        label="API key"
                        sublabel="Create a personal API key in Linear Settings > API."
                        vertical
                    >
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Input
                                    type={showKey ? "text" : "password"}
                                    placeholder="lin_api_..."
                                    value={displayKey}
                                    onChange={(e) =>
                                        setKeyInput(e.target.value)
                                    }
                                    className="h-8 text-xs pr-8 font-mono"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showKey ? (
                                        <EyeOff className="h-3.5 w-3.5" />
                                    ) : (
                                        <Eye className="h-3.5 w-3.5" />
                                    )}
                                </button>
                            </div>
                            {isDirty && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleSaveKey}
                                    className="h-8 text-xs"
                                >
                                    Save
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleTestConnection}
                                disabled={!hasKey || testConnection.isPending}
                                className="h-8 text-xs"
                            >
                                {testConnection.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : null}
                                Test
                            </Button>
                        </div>

                        {/* Connection result */}
                        {testConnection.data && (
                            <div className="mt-2">
                                {testConnection.data.success ? (
                                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Connected as{" "}
                                        {testConnection.data.userName}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                                        <XCircle className="h-3.5 w-3.5" />
                                        {testConnection.data.error}
                                    </div>
                                )}
                            </div>
                        )}
                    </SettingsRow>
                </div>

                {!hasKey && (
                    <div
                        className="animate-fade-in-up"
                        style={{ animationDelay: "200ms" }}
                    >
                        <p className="text-[12px] text-muted-foreground/60 py-4">
                            Add your API key to get started. You can then
                            configure Linear sync per project in each project's
                            settings.
                        </p>
                    </div>
                )}
            </div>

            {/* PR Lifecycle Management */}
            <div className="mt-10">
                <div
                    className="animate-fade-in-up"
                    style={{ animationDelay: "250ms" }}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-foreground"
                        >
                            <circle cx="18" cy="18" r="3" />
                            <circle cx="6" cy="6" r="3" />
                            <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                            <path d="M6 9v12" />
                        </svg>
                        <h2 className="text-sm font-medium text-foreground">
                            PR Lifecycle
                        </h2>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                        Automatically monitor PRs opened by SUSTN, address
                        reviewer feedback, and re-request reviews.
                    </p>
                </div>

                <div
                    className="space-y-1 animate-fade-in-up"
                    style={{ animationDelay: "300ms" }}
                >
                    <SettingsRow
                        label="Enable PR lifecycle"
                        sublabel="Poll GitHub for review events and auto-address feedback"
                    >
                        <Switch
                            checked={settings.prLifecycleEnabled}
                            onCheckedChange={(checked) =>
                                updateSetting({
                                    key: "prLifecycleEnabled",
                                    value: checked,
                                })
                            }
                        />
                    </SettingsRow>

                    <SettingsRow
                        label="Max review cycles"
                        sublabel="After this many change-request rounds, flag for human attention"
                    >
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                min={1}
                                max={20}
                                className="w-20 h-8 text-sm"
                                value={settings.maxReviewCycles}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (!isNaN(val) && val >= 1 && val <= 20) {
                                        updateSetting({
                                            key: "maxReviewCycles",
                                            value: val,
                                        });
                                    }
                                }}
                            />
                            <span className="text-xs text-muted-foreground">
                                cycles
                            </span>
                        </div>
                    </SettingsRow>
                </div>
            </div>
        </div>
    );
}
